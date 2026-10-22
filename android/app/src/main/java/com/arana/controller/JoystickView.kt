package com.arana.controller

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import androidx.core.content.ContextCompat
import kotlin.math.hypot
import kotlin.math.min

/** Virtual stick. Reports x (right +) and y (up +) in -1..1; returns to center on release. */
class JoystickView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    /** Called on every move while held. */
    var onMove: ((x: Double, y: Double) -> Unit)? = null
    /** Called once on release or cancel. */
    var onRelease: (() -> Unit)? = null

    private var knobX = 0f
    private var knobY = 0f
    private var held = false

    private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 3f
        color = ContextCompat.getColor(context, R.color.border)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = ContextCompat.getColor(context, R.color.surface_elevated)
    }
    private val deadPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f
        color = ContextCompat.getColor(context, R.color.border)
    }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG)

    val isHeld: Boolean get() = held

    private fun radius() = min(width, height) / 2f - 4f

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val r = radius()
        canvas.drawCircle(cx, cy, r, fillPaint)
        canvas.drawCircle(cx, cy, r, basePaint)
        canvas.drawCircle(cx, cy, r * JoystickMath.DEAD_ZONE.toFloat(), deadPaint)
        knobPaint.color = ContextCompat.getColor(context, if (held) R.color.primary else R.color.muted)
        canvas.drawCircle(cx + knobX, cy + knobY, r * 0.3f, knobPaint)
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (!isEnabled) return false
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                held = true
                update(e)
            }
            MotionEvent.ACTION_MOVE -> if (held) update(e)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> release()
        }
        return true
    }

    private fun update(e: MotionEvent) {
        val r = radius()
        var dx = e.x - width / 2f
        var dy = e.y - height / 2f
        val d = hypot(dx, dy)
        if (d > r) {
            dx *= r / d
            dy *= r / d
        }
        knobX = dx
        knobY = dy
        invalidate()
        onMove?.invoke((dx / r).toDouble(), (-dy / r).toDouble())
    }

    /** Centers the knob. Also called when the host pauses so a held stick never survives. */
    fun release() {
        val wasHeld = held
        held = false
        knobX = 0f
        knobY = 0f
        invalidate()
        if (wasHeld) onRelease?.invoke()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val size = (120 * resources.displayMetrics.density).toInt()
        setMeasuredDimension(resolveSize(size, widthMeasureSpec), resolveSize(size, heightMeasureSpec))
    }
}
