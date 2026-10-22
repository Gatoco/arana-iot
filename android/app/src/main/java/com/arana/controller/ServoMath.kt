package com.arana.controller

object ServoMath {
    enum class Status { OK, NEAR, INVALID }

    /** Joint order on the wire. */
    val NAMES = listOf("FL_hip", "FL_knee", "FR_hip", "FR_knee", "RL_hip", "RL_knee", "RR_hip", "RR_knee")

    const val NEAR_MARGIN_DEG = 5.0

    /** Legal range in degrees (docs/protocol.md): front hips -40..90, rear hips -90..40, knees -30..110. */
    fun range(index: Int): ClosedFloatingPointRange<Double> {
        require(index in 0 until SERVO_COUNT)
        return if (index % 2 == 1) -30.0..110.0
        else if (index < 4) -40.0..90.0
        else -90.0..40.0
    }

    fun status(index: Int, value: Double): Status {
        val r = range(index)
        if (!value.isFinite() || value < r.start || value > r.endInclusive) return Status.INVALID
        return if (value - r.start < NEAR_MARGIN_DEG || r.endInclusive - value < NEAR_MARGIN_DEG) Status.NEAR else Status.OK
    }
}
