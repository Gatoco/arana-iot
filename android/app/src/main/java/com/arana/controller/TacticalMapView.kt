package com.arana.controller

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * 2D heading-up map of the desktop arena, 4 m x 4 m around the spider. Draws only what telemetry
 * says; without telemetry it draws the grid and a "NO TELEMETRY" label, never a fake position.
 */
class TacticalMapView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private var telemetry: Telemetry? = null
    private val trail = ArrayDeque<Pair<Double, Double>>()

    private fun color(id: Int) = ContextCompat.getColor(context, id)
    private val dp = resources.displayMetrics.density

    private val gridMinor = stroke(R.color.border, 1f)
    private val gridMajor = stroke(R.color.muted, 1.5f).apply { alpha = 120 }
    private val obstacle = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.surface_elevated) }
    private val obstacleEdge = stroke(R.color.warning, 2f)
    private val trailPaint = stroke(R.color.trail, 2f)
    private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.primary) }
    private val footPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.text) }
    private val conePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = color(R.color.primary); alpha = 70 }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = color(R.color.muted)
        textSize = 12 * resources.displayMetrics.scaledDensity
        typeface = android.graphics.Typeface.MONOSPACE
    }
    private val warnPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = color(R.color.warning)
        textSize = 16 * resources.displayMetrics.scaledDensity
        typeface = android.graphics.Typeface.MONOSPACE
        textAlign = Paint.Align.CENTER
    }
    private val path = Path()

    private fun stroke(res: Int, w: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = w * resources.displayMetrics.density
        color = ContextCompat.getColor(context, res)
    }

    fun setTelemetry(t: Telemetry?) {
        telemetry = t
        if (t == null) {
            trail.clear()
        } else {
            val last = trail.lastOrNull()
            if (last == null || last.first != t.x || last.second != t.z) {
                trail.addLast(t.x to t.z)
                while (trail.size > TRAIL_POINTS) trail.removeFirst()
            }
        }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        val side = min(w, h)
        val ppm = side / VIEW_M
        val cx = w / 2f
        val cy = h / 2f
        canvas.drawColor(color(R.color.bg))
        val t = telemetry
        // Grid is drawn in the spider frame (heading up) when known, else north-up at the origin.
        val yaw = t?.yaw ?: 0.0
        val sx = t?.x ?: 0.0
        val sz = t?.z ?: 0.0
        drawGrid(canvas, sx, sz, yaw, cx, cy, ppm, w, h)
        drawArena(canvas, sx, sz, yaw, cx, cy, ppm)
        drawOrigin(canvas, sx, sz, yaw, cx, cy, ppm)
        drawScaleBar(canvas, ppm, h)
        canvas.drawText(context.getString(R.string.map_heading_up), 8 * dp, 16 * dp, textPaint)
        if (t == null) {
            canvas.drawText(context.getString(R.string.map_no_telemetry), cx, cy, warnPaint)
            return
        }
        drawTrail(canvas, sx, sz, yaw, cx, cy, ppm)
        t.distance?.let { drawCone(canvas, it, cx, cy, ppm) }
        drawSpider(canvas, cx, cy, ppm)
    }

    private fun proj(x: Double, z: Double, sx: Double, sz: Double, yaw: Double, cx: Float, cy: Float, ppm: Float) =
        MapMath.worldToScreen(x - sx, z - sz, yaw, cx, cy, ppm)

    private fun drawGrid(c: Canvas, sx: Double, sz: Double, yaw: Double, cx: Float, cy: Float, ppm: Float, w: Float, h: Float) {
        val reach = 4.0
        var gx = floor((sx - reach) / 0.5) * 0.5
        while (gx <= sx + reach) {
            val major = Math.abs(gx - Math.round(gx)) < 1e-6
            val a = proj(gx, sz - reach, sx, sz, yaw, cx, cy, ppm)
            val b = proj(gx, sz + reach, sx, sz, yaw, cx, cy, ppm)
            c.drawLine(a.sx, a.sy, b.sx, b.sy, if (major) gridMajor else gridMinor)
            gx += 0.5
        }
        var gz = floor((sz - reach) / 0.5) * 0.5
        while (gz <= sz + reach) {
            val major = Math.abs(gz - Math.round(gz)) < 1e-6
            val a = proj(sx - reach, gz, sx, sz, yaw, cx, cy, ppm)
            val b = proj(sx + reach, gz, sx, sz, yaw, cx, cy, ppm)
            c.drawLine(a.sx, a.sy, b.sx, b.sy, if (major) gridMajor else gridMinor)
            gz += 0.5
        }
    }

    /** Desktop arena: box (0,1.5) 0.4x0.4, cylinder (0.8,2.5) r 0.15, wall z=3.5, bounds +-6 m. */
    private fun drawArena(c: Canvas, sx: Double, sz: Double, yaw: Double, cx: Float, cy: Float, ppm: Float) {
        fun poly(vararg pts: Pair<Double, Double>, fill: Boolean) {
            path.reset()
            pts.forEachIndexed { i, (x, z) ->
                val p = proj(x, z, sx, sz, yaw, cx, cy, ppm)
                if (i == 0) path.moveTo(p.sx, p.sy) else path.lineTo(p.sx, p.sy)
            }
            path.close()
            if (fill) c.drawPath(path, obstacle)
            c.drawPath(path, obstacleEdge)
        }
        poly(-0.2 to 1.3, 0.2 to 1.3, 0.2 to 1.7, -0.2 to 1.7, fill = true)
        val cyl = proj(0.8, 2.5, sx, sz, yaw, cx, cy, ppm)
        c.drawCircle(cyl.sx, cyl.sy, 0.15f * ppm, obstacle)
        c.drawCircle(cyl.sx, cyl.sy, 0.15f * ppm, obstacleEdge)
        val w1 = proj(-6.0, 3.5, sx, sz, yaw, cx, cy, ppm)
        val w2 = proj(6.0, 3.5, sx, sz, yaw, cx, cy, ppm)
        c.drawLine(w1.sx, w1.sy, w2.sx, w2.sy, obstacleEdge)
        poly(-6.0 to -6.0, 6.0 to -6.0, 6.0 to 6.0, -6.0 to 6.0, fill = false)
    }

    private fun drawOrigin(c: Canvas, sx: Double, sz: Double, yaw: Double, cx: Float, cy: Float, ppm: Float) {
        val o = proj(0.0, 0.0, sx, sz, yaw, cx, cy, ppm)
        val r = 5 * dp
        c.drawLine(o.sx - r, o.sy, o.sx + r, o.sy, obstacleEdge)
        c.drawLine(o.sx, o.sy - r, o.sx, o.sy + r, obstacleEdge)
    }

    private fun drawScaleBar(c: Canvas, ppm: Float, h: Float) {
        val x0 = 8 * dp
        val y = h - 12 * dp
        c.drawLine(x0, y, x0 + ppm, y, stroke(R.color.text, 2f))
        c.drawText("1 m", x0 + ppm + 6 * dp, y + 4 * dp, textPaint)
    }

    private fun drawTrail(c: Canvas, sx: Double, sz: Double, yaw: Double, cx: Float, cy: Float, ppm: Float) {
        if (trail.size < 2) return
        path.reset()
        trail.forEachIndexed { i, (x, z) ->
            val p = proj(x, z, sx, sz, yaw, cx, cy, ppm)
            if (i == 0) path.moveTo(p.sx, p.sy) else path.lineTo(p.sx, p.sy)
        }
        c.drawPath(path, trailPaint)
    }

    /** Sonar cone straight ahead (up), half-angle 7.5 degrees. */
    private fun drawCone(c: Canvas, distance: Double, cx: Float, cy: Float, ppm: Float) {
        val len = (distance * ppm).toFloat()
        val half = Math.toRadians(SONAR_HALF_ANGLE_DEG)
        path.reset()
        path.moveTo(cx, cy)
        path.lineTo(cx - (len * sin(half)).toFloat(), cy - (len * cos(half)).toFloat())
        path.lineTo(cx + (len * sin(half)).toFloat(), cy - (len * cos(half)).toFloat())
        path.close()
        c.drawPath(path, conePaint)
    }

    private fun drawSpider(c: Canvas, cx: Float, cy: Float, ppm: Float) {
        val s = max(0.1f * ppm, 10 * dp)
        path.reset()
        path.moveTo(cx, cy - s)
        path.lineTo(cx - s * 0.7f, cy + s * 0.8f)
        path.lineTo(cx + s * 0.7f, cy + s * 0.8f)
        path.close()
        c.drawPath(path, bodyPaint)
        for ((fx, fy) in listOf(-1f to -0.5f, 1f to -0.5f, -1f to 0.6f, 1f to 0.6f)) {
            c.drawCircle(cx + fx * s * 1.1f, cy + fy * s, 3 * dp, footPaint)
        }
        c.drawLine(cx, cy, cx, cy - s * 1.8f, stroke(R.color.text, 2f))
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val minPx = (220 * dp).toInt()
        val w = resolveSize(minPx, widthMeasureSpec)
        // Square, but capped so the drive controls stay on screen in portrait.
        val h = resolveSize(w.coerceIn(minPx, (280 * dp).toInt()), heightMeasureSpec)
        setMeasuredDimension(w, h)
    }

    companion object {
        private const val VIEW_M = 4f
        private const val TRAIL_POINTS = 80
        private const val SONAR_HALF_ANGLE_DEG = 7.5
    }
}
