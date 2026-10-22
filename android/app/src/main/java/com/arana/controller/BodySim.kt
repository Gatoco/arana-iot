package com.arana.controller

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Synthetic robot body for Body Mode. Mirrors the twin engine rules
 * (`src/sim/engine.ts`): default `auto`, any command resets the operator idle
 * timer, `move` switches to `manual`, 5 s idle returns `manual` to `auto`.
 * No Android dependencies so it runs on the JVM.
 */
class BodySim {
    var x = 0.0
        private set
    var y = 0.0
        private set
    var z = 0.0
        private set
    var yaw = 0.0
        private set
    var forward = 0.0
        private set
    var turn = 0.0
        private set
    var gait = Gait.REST
        private set
    var mode = ControlMode.AUTO
        private set
    /** Seconds since the last operator command. */
    var operatorIdle = 0.0
        private set
    /** Gait cycle phase in turns, 0..1. */
    var phase = 0.0
        private set
    /** Last firmware action received. Only STANDBY has simulated joints; see [updateJoints]. */
    var pose: Pose? = null
        private set
    /** FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee, RR_hip, RR_knee in degrees. */
    val joints = DoubleArray(SERVO_COUNT)

    init {
        updateJoints()
    }

    fun apply(cmd: Command) {
        operatorIdle = 0.0
        when (cmd) {
            is Command.Mode -> mode = cmd.mode
            is Command.Pose -> {
                // Like the twin, an action stops the walk and holds its pose.
                forward = 0.0
                turn = 0.0
                gait = Gait.REST
                pose = cmd.pose
            }
            is Command.Move -> {
                pose = null
                mode = ControlMode.MANUAL
                forward = cmd.forward.coerceIn(-1.0, 1.0)
                turn = cmd.turn.coerceIn(-1.0, 1.0)
                if (gait == Gait.REST) gait = Gait.TETRAPOD
            }
            Command.Stop -> {
                pose = null
                forward = 0.0
                turn = 0.0
                gait = Gait.REST
            }
            is Command.Gait -> {
                pose = null
                gait = cmd.gait
            }
        }
    }

    fun step(dt: Double) {
        operatorIdle += dt
        if (mode == ControlMode.MANUAL && operatorIdle >= IDLE_TIMEOUT_S) mode = ControlMode.AUTO

        val speed = forward * when (gait) {
            Gait.TETRAPOD -> TETRAPOD_SPEED
            Gait.WAVE -> WAVE_SPEED
            Gait.REST -> 0.0
        }
        // Like the twin, a resting body does not turn in place.
        val yawRate = if (gait == Gait.REST) 0.0 else turn * YAW_RATE
        x += sin(yaw) * speed * dt
        z += cos(yaw) * speed * dt
        yaw += yawRate * dt

        val period = when (gait) {
            Gait.TETRAPOD -> 1.2
            Gait.WAVE -> 2.4
            Gait.REST -> 0.0
        }
        if (period > 0.0) phase = (phase + dt / period) % 1.0
        updateJoints()
    }

    fun telemetry(nowMs: Long): Telemetry = Telemetry(
        t = nowMs, x = x, y = y, z = z, yaw = yaw, distance = null,
        gait = gait, mode = mode, joints = joints.toList(),
    )

    private fun updateJoints() {
        val offsets = when (gait) {
            Gait.WAVE -> WAVE_OFFSETS
            else -> TETRAPOD_OFFSETS
        }
        val walking = gait != Gait.REST && (forward != 0.0 || turn != 0.0)
        // Firmware Servo_Prg_1 standby decodes to hips +-45 and knees 75; no other keyframes are simulated.
        val knee = if (pose == Pose.STANDBY) STANDBY_KNEE else NEUTRAL_KNEE
        for (leg in 0 until 4) {
            val s = sin(2 * PI * (phase + offsets[leg]))
            joints[leg * 2] = HIP_NEUTRAL[leg] + if (walking) HIP_SWING * s else 0.0
            joints[leg * 2 + 1] = knee + if (walking) KNEE_LIFT * max(0.0, s) else 0.0
        }
    }

    companion object {
        const val IDLE_TIMEOUT_S = 5.0
        const val TETRAPOD_SPEED = 0.17
        const val WAVE_SPEED = 0.083
        const val YAW_RATE = 1.2
        private const val HIP_SWING = 15.0
        private const val KNEE_LIFT = 20.0
        private const val NEUTRAL_KNEE = 65.0
        private const val STANDBY_KNEE = 75.0
        /** Neutral stance hips in leg order FL, FR, RL, RR. */
        private val HIP_NEUTRAL = doubleArrayOf(45.0, 45.0, -45.0, -45.0)
        /** Leg order FL, FR, RL, RR (protocol order). */
        private val TETRAPOD_OFFSETS = doubleArrayOf(0.0, 0.5, 0.5, 0.0)
        private val WAVE_OFFSETS = doubleArrayOf(0.0, 0.5, 0.75, 0.25)
    }
}
