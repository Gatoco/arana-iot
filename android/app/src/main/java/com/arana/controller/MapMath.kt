package com.arana.controller

import kotlin.math.cos
import kotlin.math.sin

/**
 * Heading-up projection for the tactical map. Protocol frame: heading vector is
 * (sin yaw, cos yaw), +Z forward at yaw 0, positive yaw = turned left, so +X is the left side
 * at yaw 0. Screen: forward is up, left is screen-left.
 */
object MapMath {
    data class P(val sx: Float, val sy: Float)

    /** Meters from the spider (world frame) -> pixels, spider at [cx],[cy], [ppm] pixels per meter. */
    fun worldToScreen(dx: Double, dz: Double, yaw: Double, cx: Float, cy: Float, ppm: Float): P {
        val forward = dx * sin(yaw) + dz * cos(yaw)
        val left = dx * cos(yaw) - dz * sin(yaw)
        return P(cx - (left * ppm).toFloat(), cy - (forward * ppm).toFloat())
    }
}
