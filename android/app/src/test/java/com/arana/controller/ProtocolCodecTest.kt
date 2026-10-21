package com.arana.controller

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolCodecTest {
    @Test
    fun topicsMatchProtocolTs() {
        assertEquals("arana/cmd", Topic.CMD)
        assertEquals("arana/telemetry", Topic.TELEMETRY)
    }

    @Test
    fun encodesMove() {
        val o = JSONObject(ProtocolCodec.encodeCommand(Command.Move(0.5, -0.25)))
        assertEquals("move", o.getString("kind"))
        assertEquals(0.5, o.getDouble("forward"), 0.0)
        assertEquals(-0.25, o.getDouble("turn"), 0.0)
        assertEquals(3, o.length())
    }

    @Test
    fun encodesStopGaitMode() {
        assertEquals("""{"kind":"stop"}""", ProtocolCodec.encodeCommand(Command.Stop))
        val g = JSONObject(ProtocolCodec.encodeCommand(Command.Gait(Gait.WAVE)))
        assertEquals("gait", g.getString("kind"))
        assertEquals("wave", g.getString("gait"))
        val m = JSONObject(ProtocolCodec.encodeCommand(Command.Mode(ControlMode.MANUAL)))
        assertEquals("mode", m.getString("kind"))
        assertEquals("manual", m.getString("mode"))
    }

    @Test
    fun decodesCommandsRoundTrip() {
        val cmds = listOf(
            Command.Move(1.0, 0.5),
            Command.Stop,
            Command.Gait(Gait.TETRAPOD),
            Command.Mode(ControlMode.AUTO),
        )
        for (c in cmds) assertEquals(c, ProtocolCodec.decodeCommand(ProtocolCodec.encodeCommand(c)))
    }

    @Test
    fun rejectsInvalidCommands() {
        assertNull(ProtocolCodec.decodeCommand("not json"))
        assertNull(ProtocolCodec.decodeCommand("""{"kind":"fly"}"""))
        assertNull(ProtocolCodec.decodeCommand("""{"kind":"gait","gait":"run"}"""))
        assertNull(ProtocolCodec.decodeCommand("""{"kind":"mode","mode":"x"}"""))
        assertNull(ProtocolCodec.decodeCommand("""{"kind":"move"}"""))
    }

    @Test
    fun telemetryRoundTripWithNullDistance() {
        val t = Telemetry(
            t = 1700000000000L, x = 0.1, y = 0.05, z = -0.2, yaw = 0.3,
            distance = null, gait = Gait.REST, mode = ControlMode.AUTO,
            joints = List(8) { it * 1.5 },
        )
        val json = ProtocolCodec.encodeTelemetry(t)
        val o = JSONObject(json)
        assertTrue(o.isNull("distance"))
        assertTrue(o.has("distance"))
        assertEquals(8, o.getJSONArray("joints").length())
        assertEquals("auto", o.getString("mode"))
        assertEquals(t, ProtocolCodec.decodeTelemetry(json))
    }

    @Test
    fun decodesTelemetryFromTwin() {
        val json = """{"t":1,"x":1.5,"y":0.08,"z":2,"yaw":-1,"distance":0.42,"gait":"wave","mode":"manual","joints":[0,1,2,3,4,5,6,7]}"""
        val t = ProtocolCodec.decodeTelemetry(json)!!
        assertEquals(0.42, t.distance!!, 0.0)
        assertEquals(Gait.WAVE, t.gait)
        assertEquals(ControlMode.MANUAL, t.mode)
        assertEquals(7.0, t.joints[7], 0.0)
    }

    @Test
    fun rejectsInvalidTelemetry() {
        assertNull(ProtocolCodec.decodeTelemetry("{}"))
    }
}
