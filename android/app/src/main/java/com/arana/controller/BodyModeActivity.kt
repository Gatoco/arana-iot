package com.arana.controller

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.snackbar.Snackbar
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Simulated robot body: answers `arana/cmd` and publishes telemetry at 10 Hz. */
class BodyModeActivity : AppCompatActivity(), MqttLink.Listener {
    private lateinit var link: MqttLink
    private lateinit var status: TextView
    private lateinit var stateView: TextView
    private lateinit var logView: TextView

    private val sim = BodySim()
    private val log = ArrayDeque<String>()
    private val main = Handler(Looper.getMainLooper())
    private val clock = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)
    private var lastTick = 0L

    private val tick = object : Runnable {
        override fun run() {
            val now = SystemClock.elapsedRealtime()
            sim.step((now - lastTick) / 1000.0)
            lastTick = now
            if (link.isConnected) {
                link.publish(Topic.TELEMETRY, ProtocolCodec.encodeTelemetry(sim.telemetry(System.currentTimeMillis())))
            }
            renderState()
            main.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_body)
        status = findViewById(R.id.status)
        stateView = findViewById(R.id.state)
        logView = findViewById(R.id.log)

        val config = ConnectionActivity.brokerConfig(intent)
        status.text = getString(R.string.status_connecting, config.uri)
        link = MqttLink(this)
        link.connect(config, listOf(Topic.CMD))
        renderState()
    }

    override fun onStart() {
        super.onStart()
        lastTick = SystemClock.elapsedRealtime()
        main.post(tick)
    }

    override fun onStop() {
        main.removeCallbacks(tick)
        super.onStop()
    }

    override fun onDestroy() {
        link.close()
        super.onDestroy()
    }

    override fun onConnected(uri: String) {
        status.text = getString(R.string.status_connected, uri)
    }

    override fun onDisconnected(error: String?) {
        val text = if (error == null) getString(R.string.status_disconnected) else getString(R.string.status_error, error)
        status.text = text
        Snackbar.make(findViewById(R.id.root), text, Snackbar.LENGTH_LONG).show()
    }

    override fun onMessage(topic: String, payload: String) {
        if (topic != Topic.CMD) return
        val cmd = ProtocolCodec.decodeCommand(payload)
        if (cmd != null) sim.apply(cmd)
        val line = clock.format(Date()) + "  " + (if (cmd == null) "ignored " else "") + payload
        log.addFirst(line)
        while (log.size > LOG_LINES) log.removeLast()
        logView.text = log.joinToString("\n")
        renderState()
    }

    private fun renderState() {
        val joints = sim.joints.joinToString(" ") { String.format(Locale.US, "%.0f", it) }
        stateView.text = String.format(
            Locale.US,
            "x %.3f m   z %.3f m\nyaw %.2f rad\ngait %s   mode %s\nidle %.1f s\njoints %s",
            sim.x, sim.z, sim.yaw, sim.gait.wire, sim.mode.wire, sim.operatorIdle, joints,
        )
    }

    companion object {
        private const val TICK_MS = 100L
        private const val LOG_LINES = 30
    }
}
