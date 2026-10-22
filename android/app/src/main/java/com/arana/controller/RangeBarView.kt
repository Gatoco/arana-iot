package com.arana.controller

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat

/** Horizontal bar with a marker at [value] inside [min]..[max]. Null value draws only the track. */
class RangeBarView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {
    private var value: Double? = null
    private var min = 0.0
    private var max = 1.0
    private var colorRes = R.color.primary
    private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(context, R.color.border) }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()

    fun set(value: Double?, range: ClosedFloatingPointRange<Double>, status: ServoMath.Status?) {
        this.value = value
        min = range.start
        max = range.endInclusive
        colorRes = when (status) {
            ServoMath.Status.NEAR -> R.color.warning
            ServoMath.Status.INVALID -> R.color.danger
            else -> R.color.primary
        }
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val h = height.toFloat()
        val w = width.toFloat()
        val barH = h * 0.4f
        val top = (h - barH) / 2f
        rect.set(0f, top, w, top + barH)
        canvas.drawRoundRect(rect, 4f, 4f, track)
        val v = value ?: return
        if (!v.isFinite()) return
        val frac = ((v - min) / (max - min)).coerceIn(0.0, 1.0).toFloat()
        fill.color = ContextCompat.getColor(context, colorRes)
        rect.set(0f, top, w * frac, top + barH)
        canvas.drawRoundRect(rect, 4f, 4f, fill)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val h = (12 * resources.displayMetrics.density).toInt()
        setMeasuredDimension(resolveSize(0, widthMeasureSpec), resolveSize(h, heightMeasureSpec))
    }
}
