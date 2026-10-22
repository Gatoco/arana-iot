package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class JoystickMathTest {
    @Test
    fun rightProducesNegativeTurn() {
        val m = JoystickMath.toMove(1.0, 0.0, 1.0)
        assertTrue(m.turn < 0)
        assertEquals(0.0, m.forward, 1e-9)
    }

    @Test
    fun leftProducesPositiveTurn() {
        assertTrue(JoystickMath.toMove(-1.0, 0.0, 1.0).turn > 0)
    }

    @Test
    fun upIsForwardDownIsBack() {
        assertTrue(JoystickMath.toMove(0.0, 1.0, 1.0).forward > 0)
        assertTrue(JoystickMath.toMove(0.0, -1.0, 1.0).forward < 0)
    }

    @Test
    fun deadZoneYieldsZero() {
        assertEquals(Command.Move(0.0, 0.0), JoystickMath.toMove(0.05, 0.05, 1.0))
        assertEquals(Command.Move(0.0, 0.0), JoystickMath.toMove(0.0, 0.0, 1.0))
    }

    @Test
    fun throttleScalesAndFullDeflectionReachesThrottle() {
        assertEquals(0.6, JoystickMath.toMove(0.0, 1.0, 0.6).forward, 1e-9)
    }

    @Test
    fun outputIsClampedToUnit() {
        val m = JoystickMath.toMove(5.0, 5.0, 1.0)
        assertTrue(m.forward <= 1.0 && m.turn >= -1.0)
    }
}
