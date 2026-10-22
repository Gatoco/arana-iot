package com.arana.controller

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * Kotlin mirror of `src/protocol.ts`. The twin, this app and the future ESP
 * body must speak exactly these messages. Change `src/protocol.ts` first.
 */
object Topic {
    /** Commands sent to the body (twin now, ESP later). */
    const val CMD = "arana/cmd"
    /** Body telemetry: pose, distance sensor, joint angles. */
    const val TELEMETRY = "arana/telemetry"
    /** Brain state published by the fly-brain service. */
    const val BRAIN_STATE = "arana/brain/state"
    /** Stimulus pushed into the brain. */
    const val BRAIN_STIMULUS = "arana/brain/stimulus"
}

object CmdKind {
    const val MOVE = "move"
    const val STOP = "stop"
    const val GAIT = "gait"
    const val POSE = "pose"
    const val MODE = "mode"
}

enum class Gait(val wire: String) {
    TETRAPOD("tetrapod"),
    WAVE("wave"),
    REST("rest");

    companion object {
        fun fromWire(value: String): Gait? = entries.firstOrNull { it.wire == value }
    }
}

/** Firmware preset actions, in protocol order. [label] is the product label. */
enum class Pose(val wire: String, val label: String) {
    FIGHTING("fighting", "Fighting"),
    STANDBY("standby", "Standby"),
    PUSHUP("pushup", "Push-Up"),
    SLEEP("sleep", "Sleep"),
    LIE("lie", "Lie Down"),
    HELLO("hello", "Greet"),
    DANCE3("dance3", "Leg Raise"),
    DANCE2("dance2", "Swing"),
    DANCE1("dance1", "Relax");

    companion object {
        fun fromWire(value: String): Pose? = entries.firstOrNull { it.wire == value }
    }
}

/** Who drives the body: the brain (`auto`) or the operator (`manual`). */
enum class ControlMode(val wire: String) {
    AUTO("auto"),
    MANUAL("manual");

    companion object {
        fun fromWire(value: String): ControlMode? = entries.firstOrNull { it.wire == value }
    }
}

/** Commands the body understands, published on [Topic.CMD]. */
sealed class Command {
    /** [forward] and [turn] are -1..1; positive turn = left. */
    data class Move(val forward: Double, val turn: Double) : Command()
    data object Stop : Command()
    data class Gait(val gait: com.arana.controller.Gait) : Command()
    data class Mode(val mode: ControlMode) : Command()
    data class Pose(val pose: com.arana.controller.Pose) : Command()
}

/** Telemetry snapshot published by the body on [Topic.TELEMETRY]. */
data class Telemetry(
    /** Epoch milliseconds. */
    val t: Long,
    /** Meters, world frame. */
    val x: Double,
    val y: Double,
    val z: Double,
    /** Heading in radians. */
    val yaw: Double,
    /** Ultrasonic distance in meters, null when no echo. */
    val distance: Double?,
    val gait: Gait,
    val mode: ControlMode,
    /** 8 angles in degrees: FL_hip, FL_knee, FR_hip, FR_knee, RL_hip, RL_knee, RR_hip, RR_knee. */
    val joints: List<Double>,
)

const val SERVO_COUNT = 8

/** JSON wire codec. Decoders return null for anything that is not a valid message. */
object ProtocolCodec {
    fun encodeCommand(cmd: Command): String {
        val o = JSONObject()
        when (cmd) {
            is Command.Move -> {
                o.put("kind", CmdKind.MOVE)
                o.put("forward", cmd.forward)
                o.put("turn", cmd.turn)
            }
            Command.Stop -> o.put("kind", CmdKind.STOP)
            is Command.Gait -> {
                o.put("kind", CmdKind.GAIT)
                o.put("gait", cmd.gait.wire)
            }
            is Command.Mode -> {
                o.put("kind", CmdKind.MODE)
                o.put("mode", cmd.mode.wire)
            }
            is Command.Pose -> {
                o.put("kind", CmdKind.POSE)
                o.put("pose", cmd.pose.wire)
            }
        }
        return o.toString()
    }

    fun decodeCommand(json: String): Command? = try {
        val o = JSONObject(json)
        when (o.getString("kind")) {
            CmdKind.MOVE -> {
                val forward = o.getDouble("forward")
                val turn = o.getDouble("turn")
                if (forward.isFinite() && turn.isFinite()) Command.Move(forward, turn) else null
            }
            CmdKind.STOP -> Command.Stop
            CmdKind.GAIT -> Gait.fromWire(o.getString("gait"))?.let { Command.Gait(it) }
            CmdKind.MODE -> ControlMode.fromWire(o.getString("mode"))?.let { Command.Mode(it) }
            CmdKind.POSE -> Pose.fromWire(o.getString("pose"))?.let { Command.Pose(it) }
            else -> null
        }
    } catch (_: JSONException) {
        null
    }

    fun encodeTelemetry(t: Telemetry): String {
        val o = JSONObject()
        o.put("t", t.t)
        o.put("x", t.x)
        o.put("y", t.y)
        o.put("z", t.z)
        o.put("yaw", t.yaw)
        o.put("distance", t.distance ?: JSONObject.NULL)
        o.put("gait", t.gait.wire)
        o.put("mode", t.mode.wire)
        val joints = JSONArray()
        for (j in t.joints) joints.put(j)
        o.put("joints", joints)
        return o.toString()
    }

    fun decodeTelemetry(json: String): Telemetry? = try {
        val o = JSONObject(json)
        val gait = Gait.fromWire(o.getString("gait"))
        val mode = ControlMode.fromWire(o.getString("mode"))
        val arr = o.getJSONArray("joints")
        val joints = if (arr.length() == SERVO_COUNT) List(SERVO_COUNT) { arr.getDouble(it) } else null
        val t = o.getLong("t")
        val x = o.getDouble("x")
        val y = o.getDouble("y")
        val z = o.getDouble("z")
        val yaw = o.getDouble("yaw")
        val distance = if (o.isNull("distance")) null else o.getDouble("distance")
        val finite = x.isFinite() && y.isFinite() && z.isFinite() && yaw.isFinite() &&
            (distance == null || distance.isFinite()) && joints != null && joints.all { it.isFinite() }
        if (gait == null || mode == null || !finite) null
        else Telemetry(t, x, y, z, yaw, distance, gait, mode, joints!!)
    } catch (_: JSONException) {
        null
    }
}
