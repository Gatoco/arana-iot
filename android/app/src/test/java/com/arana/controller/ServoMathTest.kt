package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Test

class ServoMathTest {
    @Test
    fun neutralStanceIsOk() {
        val neutral = listOf(45.0, 65.0, 45.0, 65.0, -45.0, 65.0, -45.0, 65.0)
        neutral.forEachIndexed { i, v -> assertEquals(ServoMath.Status.OK, ServoMath.status(i, v)) }
    }

    @Test
    fun rangesFollowProtocol() {
        assertEquals(-40.0..90.0, ServoMath.range(0))
        assertEquals(-90.0..40.0, ServoMath.range(6))
        assertEquals(-30.0..110.0, ServoMath.range(1))
    }

    @Test
    fun nearAndInvalid() {
        assertEquals(ServoMath.Status.NEAR, ServoMath.status(1, 108.0))
        assertEquals(ServoMath.Status.INVALID, ServoMath.status(1, 111.0))
        assertEquals(ServoMath.Status.INVALID, ServoMath.status(0, Double.NaN))
    }
}
