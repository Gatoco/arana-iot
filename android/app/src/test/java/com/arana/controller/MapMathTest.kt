package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Test
import kotlin.math.PI

class MapMathTest {
    @Test
    fun pointAheadIsAboveCenterAtYawZero() {
        val p = MapMath.worldToScreen(0.0, 1.0, 0.0, 100f, 100f, 50f)
        assertEquals(100f, p.sx, 1e-3f)
        assertEquals(50f, p.sy, 1e-3f)
    }

    @Test
    fun plusXIsLeftAtYawZero() {
        val p = MapMath.worldToScreen(1.0, 0.0, 0.0, 100f, 100f, 50f)
        assertEquals(50f, p.sx, 1e-3f)
        assertEquals(100f, p.sy, 1e-3f)
    }

    @Test
    fun headingUpPutsHeadingDirectionStraightUp() {
        val yaw = PI / 2 // heading vector (1, 0)
        val p = MapMath.worldToScreen(1.0, 0.0, yaw, 100f, 100f, 50f)
        assertEquals(100f, p.sx, 1e-3f)
        assertEquals(50f, p.sy, 1e-3f)
    }
}
