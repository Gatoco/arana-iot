package com.arana.controller

import kotlin.math.hypot

object JoystickMath {
    const val DEAD_ZONE = 0.12

    /**
     * [x] right-positive and [y] up-positive, both in -1..1 (the knob position inside the base).
     * Protocol: turn positive = left, so pushing right yields a negative turn.
     * Returns a zero move inside the dead zone; the live range is rescaled so it starts at 0.
     */
    fun toMove(x: Double, y: Double, throttle: Double): Command.Move {
        val m = hypot(x, y)
        if (m < DEAD_ZONE) return Command.Move(0.0, 0.0)
        val clamped = minOf(m, 1.0)
        val k = (clamped - DEAD_ZONE) / (1.0 - DEAD_ZONE) / m
        val t = throttle.coerceIn(0.0, 1.0)
        return Command.Move(
            forward = (y * k * t).coerceIn(-1.0, 1.0),
            turn = (-x * k * t).coerceIn(-1.0, 1.0),
        )
    }
}
