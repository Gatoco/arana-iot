package com.arana.controller

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.arana.controller.databinding.FragmentConsoleBinding
import com.arana.controller.databinding.ItemStatBinding
import com.arana.controller.databinding.PartConsoleControlsBinding
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Tactical map, drive controls, telemetry cards and packet log. */
class ConsoleFragment : Fragment() {
    private var _b: FragmentConsoleBinding? = null
    private val b get() = _b!!
    private val c: PartConsoleControlsBinding get() = b.controls
    private val link get() = (requireActivity().application as AranaApp).container.link

    private val stats = mutableMapOf<Int, TextView>()
    private val servoCells = mutableListOf<TextView>()
    private var driveJob: Job? = null
    private var stickX = 0.0
    private var stickY = 0.0
    private var sentThisTouch = false
    private var lastSentNonZero = false
    private var logPaused = false
    private var logOpen = false
    private val clock = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    override fun onCreateView(i: LayoutInflater, container: ViewGroup?, s: Bundle?): View {
        _b = FragmentConsoleBinding.inflate(i, container, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        buildStats()
        wireDrive()
        wireLog()
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    combine(link.state, link.telemetry, link.lastTelemetryAt, UiFormat.ticker(250)) { s, t, at, _ -> Triple(s, t, at) }
                        .collect { (s, t, at) -> render(s, t, at) }
                }
                launch { link.log.collect { renderLog(it) } }
            }
        }
    }

    private fun buildStats() {
        val items = listOf(
            R.string.stat_pose, R.string.stat_heading, R.string.stat_distance, R.string.stat_gait,
            R.string.stat_mode, R.string.stat_link, R.string.stat_age,
        )
        for (label in items) {
            val item = ItemStatBinding.inflate(layoutInflater, c.statGrid, false)
            item.label.setText(label)
            stats[label] = item.value
            c.statGrid.addView(item.root)
        }
        for (name in ServoMath.NAMES) {
            val item = ItemStatBinding.inflate(layoutInflater, c.servoStrip, false)
            item.label.text = name
            item.label.textSize = 9f
            item.value.textSize = 12f
            servoCells += item.value
            c.servoStrip.addView(item.root)
        }
    }

    private fun wireDrive() {
        c.joystick.onMove = { x, y ->
            stickX = x
            stickY = y
            if (driveJob == null) startDriveLoop()
        }
        c.joystick.onRelease = {
            driveJob?.cancel()
            driveJob = null
            if (sentThisTouch) link.publish(Command.Stop)
            sentThisTouch = false
            lastSentNonZero = false
            stickX = 0.0
            stickY = 0.0
        }
        c.stopButton.setOnClickListener { link.publish(Command.Stop) }
        // Click listeners, not checked listeners: state restoration after rotation also fires the
        // checked callbacks and must never publish a command the operator did not ask for.
        mapOf(c.gaitTetrapod to Gait.TETRAPOD, c.gaitWave to Gait.WAVE, c.gaitRest to Gait.REST)
            .forEach { (button, gait) -> button.setOnClickListener { link.publish(Command.Gait(gait)) } }
        c.manualSwitch.setOnClickListener {
            link.publish(Command.Mode(if (c.manualSwitch.isChecked) ControlMode.MANUAL else ControlMode.AUTO))
        }
    }

    /** 10 Hz while the stick is held; nothing before the first touch, a single stop on release. */
    private fun startDriveLoop() {
        driveJob = viewLifecycleOwner.lifecycleScope.launch {
            while (isActive) {
                val move = JoystickMath.toMove(stickX, stickY, c.throttle.value.toDouble())
                val zero = move.forward == 0.0 && move.turn == 0.0
                if (!zero || lastSentNonZero) {
                    if (link.publish(move)) sentThisTouch = true
                    lastSentNonZero = !zero
                }
                delay(DRIVE_PERIOD_MS)
            }
        }
    }

    private fun wireLog() {
        c.logToggle.setOnClickListener {
            logOpen = !logOpen
            val vis = if (logOpen) View.VISIBLE else View.GONE
            c.logText.visibility = vis
            c.logPause.visibility = vis
            c.logClear.visibility = vis
            if (logOpen) renderLog(link.log.value)
        }
        c.logPause.setOnClickListener {
            logPaused = !logPaused
            c.logPause.setText(if (logPaused) R.string.resume else R.string.pause)
            if (!logPaused) renderLog(link.log.value)
        }
        c.logClear.setOnClickListener { link.clearLog() }
    }

    private fun renderLog(entries: List<PacketLogEntry>) {
        if (!logOpen || logPaused || _b == null) return
        c.logText.text = entries.asReversed().joinToString("\n") {
            clock.format(Date(it.atMs)) + " " + it.direction.name + " " + it.topic + " " + it.json +
                if (it.unconfirmed) " (unconfirmed)" else ""
        }
    }

    private fun render(s: LinkState, t: Telemetry?, lastAt: Long) {
        if (_b == null) return
        val connected = s is LinkState.Connected
        val now = link.nowMs()
        val age = UiFormat.ageSeconds(lastAt, now)
        val noBody = link.noTelemetry()

        // Broker link and body telemetry are separate facts.
        val body = when {
            !connected -> "--"
            age == null || noBody -> "NO TELEMETRY"
            else -> String.format(Locale.US, "LIVE %.1f s", age)
        }
        c.stripText.text = "BROKER ${UiFormat.stateLabel(requireContext(), s)}  |  BODY $body  |  MODE ${UiFormat.modeLabel(requireContext(), t)}"
        c.noTelemetryBanner.visibility = if (noBody) View.VISIBLE else View.GONE

        c.joystick.isEnabled = connected
        c.joystick.alpha = if (connected) 1f else 0.4f
        c.stopButton.isEnabled = connected
        c.throttle.isEnabled = connected
        c.manualSwitch.isEnabled = connected
        for (i in 0 until c.gaitGroup.childCount) c.gaitGroup.getChildAt(i).isEnabled = connected
        c.driveNote.visibility = if (!connected || noBody) View.VISIBLE else View.GONE
        c.driveNote.setText(if (!connected) R.string.drive_disabled else R.string.drive_unconfirmed)

        b.map.setTelemetry(if (connected) t else null)

        val dash = getString(R.string.no_value)
        stats[R.string.stat_pose]?.text = t?.let { "x ${UiFormat.num(it.x)} / z ${UiFormat.num(it.z)} m" } ?: dash
        stats[R.string.stat_heading]?.text = t?.let { UiFormat.degrees(Math.toDegrees(it.yaw)) } ?: dash
        stats[R.string.stat_distance]?.text = when {
            t == null -> dash
            t.distance == null -> getString(R.string.no_echo)
            else -> UiFormat.num(t.distance * 100, 0) + " cm"
        }
        stats[R.string.stat_gait]?.text = t?.gait?.wire ?: dash
        stats[R.string.stat_mode]?.text = t?.mode?.wire ?: dash
        stats[R.string.stat_link]?.text = UiFormat.stateLabel(requireContext(), s)
        stats[R.string.stat_age]?.text = age?.let { UiFormat.num(it, 1) + " s" } ?: dash
        servoCells.forEachIndexed { i, tv -> tv.text = t?.joints?.getOrNull(i)?.let(UiFormat::degrees) ?: dash }

        syncControls(t)
    }

    /** Mirrors the body state onto the controls without sending anything. */
    private fun syncControls(t: Telemetry?) {
        if (t == null) return
        c.manualSwitch.isChecked = t.mode == ControlMode.MANUAL
        val id = when (t.gait) {
            Gait.TETRAPOD -> R.id.gaitTetrapod
            Gait.WAVE -> R.id.gaitWave
            Gait.REST -> R.id.gaitRest
        }
        if (c.gaitGroup.checkedButtonId != id) c.gaitGroup.check(id)
    }

    override fun onPause() {
        // Never leave the stick held across a lifecycle change; release sends one stop.
        _b?.let { c.joystick.release() }
        super.onPause()
    }

    override fun onDestroyView() {
        driveJob?.cancel()
        driveJob = null
        stats.clear()
        servoCells.clear()
        _b = null
        super.onDestroyView()
    }

    private companion object {
        const val DRIVE_PERIOD_MS = 100L
    }
}
