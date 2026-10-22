package com.arana.controller

import android.os.Bundle
import android.os.SystemClock
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.arana.controller.databinding.ActivityBodyModeBinding
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Optional demo body: this phone answers `arana/cmd` and publishes telemetry at 10 Hz on the
 * app-scoped broker session. Only one body should publish on the broker at a time.
 */
class BodyModeActivity : AppCompatActivity() {
    private lateinit var b: ActivityBodyModeBinding
    private val link get() = (application as AranaApp).container.link
    private val sim = BodySim()
    private val log = ArrayDeque<String>()
    private val clock = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (link.currentState() !is LinkState.Connected) {
            finish()
            return
        }
        b = ActivityBodyModeBinding.inflate(layoutInflater)
        setContentView(b.root)
        link.subscribeCommands()

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch { link.commands.collect(::onCommand) }
                launch { link.state.collect { b.status.text = UiFormat.stateLabel(this@BodyModeActivity, it) } }
                launch { tickLoop() }
            }
        }
    }

    private suspend fun tickLoop() {
        var last = SystemClock.elapsedRealtime()
        while (true) {
            val now = SystemClock.elapsedRealtime()
            sim.step((now - last) / 1000.0)
            last = now
            link.publishTelemetry(ProtocolCodec.encodeTelemetry(sim.telemetry(System.currentTimeMillis())))
            renderState()
            delay(TICK_MS)
        }
    }

    private fun onCommand(payload: String) {
        val cmd = ProtocolCodec.decodeCommand(payload)
        if (cmd != null) sim.apply(cmd)
        log.addFirst(clock.format(Date()) + "  " + (if (cmd == null) "ignored " else "") + payload)
        while (log.size > LOG_LINES) log.removeLast()
        b.log.text = log.joinToString("\n")
        renderState()
    }

    private fun renderState() {
        val joints = sim.joints.joinToString(" ") { String.format(Locale.US, "%.0f", it) }
        val pose = sim.pose?.let { "\n" + getString(R.string.body_pose_note, it.wire) }.orEmpty()
        b.state.text = String.format(
            Locale.US,
            "x %.3f m   z %.3f m\nyaw %.2f rad\ngait %s   mode %s\nidle %.1f s\njoints %s%s",
            sim.x, sim.z, sim.yaw, sim.gait.wire, sim.mode.wire, sim.operatorIdle, joints, pose,
        )
    }

    override fun onDestroy() {
        if (::b.isInitialized) link.unsubscribeCommands()
        super.onDestroy()
    }

    private companion object {
        const val TICK_MS = 100L
        const val LOG_LINES = 30
    }
}
