package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BodySimTest {
    private fun run(sim: BodySim, seconds: Double, dt: Double = 0.1) {
        var t = 0.0
        while (t < seconds - 1e-9) {
            sim.step(dt)
            t += dt
        }
    }

    @Test
    fun defaultsToAutoAndRest() {
        val sim = BodySim()
        assertEquals(ControlMode.AUTO, sim.mode)
        assertEquals(Gait.REST, sim.gait)
        assertEquals(8, sim.joints.size)
    }

    @Test
    fun moveSwitchesToManualAndLeavesRest() {
        val sim = BodySim()
        sim.apply(Command.Move(1.0, 0.0))
        assertEquals(ControlMode.MANUAL, sim.mode)
        assertEquals(Gait.TETRAPOD, sim.gait)
    }

    @Test
    fun fiveSecondsIdleReturnsToAuto() {
        val sim = BodySim()
        sim.apply(Command.Move(1.0, 0.0))
        run(sim, 4.9)
        assertEquals(ControlMode.MANUAL, sim.mode)
        run(sim, 0.2)
        assertEquals(ControlMode.AUTO, sim.mode)
    }

    @Test
    fun anyCommandResetsIdleTimer() {
        val sim = BodySim()
        sim.apply(Command.Move(1.0, 0.0))
        run(sim, 4.0)
        sim.apply(Command.Gait(Gait.WAVE))
        run(sim, 4.0)
        assertEquals(ControlMode.MANUAL, sim.mode)
    }

    @Test
    fun modeCommandSetsModeExplicitly() {
        val sim = BodySim()
        sim.apply(Command.Mode(ControlMode.MANUAL))
        assertEquals(ControlMode.MANUAL, sim.mode)
        sim.apply(Command.Mode(ControlMode.AUTO))
        assertEquals(ControlMode.AUTO, sim.mode)
    }

    @Test
    fun stopZeroesMotionAndRests() {
        val sim = BodySim()
        sim.apply(Command.Move(1.0, 0.5))
        sim.apply(Command.Stop)
        assertEquals(0.0, sim.forward, 0.0)
        assertEquals(0.0, sim.turn, 0.0)
        assertEquals(Gait.REST, sim.gait)
        val z = sim.z
        run(sim, 1.0)
        assertEquals(z, sim.z, 1e-12)
    }

    @Test
    fun forwardAdvancesPoseAlongHeading() {
        val sim = BodySim()
        sim.apply(Command.Move(1.0, 0.0))
        run(sim, 1.0)
        assertEquals(0.17, sim.z, 1e-6)
        assertEquals(0.0, sim.x, 1e-9)
    }

    @Test
    fun waveIsSlowerThanTetrapod() {
        val sim = BodySim()
        sim.apply(Command.Gait(Gait.WAVE))
        sim.apply(Command.Move(1.0, 0.0))
        assertEquals(Gait.WAVE, sim.gait)
        run(sim, 1.0)
        assertEquals(0.083, sim.z, 1e-6)
    }

    @Test
    fun positiveTurnIncreasesYaw() {
        val sim = BodySim()
        sim.apply(Command.Move(0.0, 1.0))
        run(sim, 1.0)
        assertEquals(1.2, sim.yaw, 1e-6)
    }

    @Test
    fun jointsMoveWhileWalking() {
        val sim = BodySim()
        val before = sim.joints.copyOf()
        sim.apply(Command.Move(1.0, 0.0))
        run(sim, 0.3)
        assertTrue(!before.contentEquals(sim.joints))
    }

    @Test
    fun telemetrySnapshotCarriesState() {
        val sim = BodySim()
        sim.apply(Command.Move(1.0, 0.0))
        val t = sim.telemetry(1234L)
        assertEquals(1234L, t.t)
        assertEquals(ControlMode.MANUAL, t.mode)
        assertEquals(Gait.TETRAPOD, t.gait)
        assertEquals(8, t.joints.size)
        assertEquals(null, t.distance)
    }
}
