package com.arana.controller

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.MotionEvent
import android.view.View
import android.widget.RadioGroup
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.materialswitch.MaterialSwitch
import com.google.android.material.slider.Slider
import com.google.android.material.snackbar.Snackbar
import java.util.Locale

/** Operator remote: d-pad, gait, speed, auto/manual, STOP and live telemetry. */
class ControlActivity : AppCompatActivity(), MqttLink.Listener {
    private lateinit var link: MqttLink
    private lateinit var status: TextView
    private lateinit var telemetry: TextView
    private lateinit var manualSwitch: MaterialSwitch
    private lateinit var speed: Slider

    private val main = Handler(Looper.getMainLooper())
    /** Held direction as (forward, turn) unit signs, null when released. */
    private var held: Pair<Double, Double>? = null
    /** True while the switch is updated from telemetry, so it does not re-publish. */
    private var syncingSwitch = false

    private val repeatMove = object : Runnable {
        override fun run() {
            sendMove()
            if (held != null) main.postDelayed(this, MOVE_REPEAT_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_control)
        status = findViewById(R.id.status)
        telemetry = findViewById(R.id.telemetry)
        manualSwitch = findViewById(R.id.manual_switch)
        speed = findViewById(R.id.speed)

        bindDirection(R.id.dpad_forward, 1.0, 0.0)
        bindDirection(R.id.dpad_back, -1.0, 0.0)
        bindDirection(R.id.dpad_left, 0.0, 1.0) // positive turn = left
        bindDirection(R.id.dpad_right, 0.0, -1.0)

        findViewById<MaterialButton>(R.id.stop).setOnClickListener {
            release()
            send(Command.Stop)
        }

        findViewById<RadioGroup>(R.id.gait_group).setOnCheckedChangeListener { _, id ->
            val gait = when (id) {
                R.id.gait_tetrapod -> Gait.TETRAPOD
                R.id.gait_wave -> Gait.WAVE
                R.id.gait_rest -> Gait.REST
                else -> return@setOnCheckedChangeListener
            }
            send(Command.Gait(gait))
        }

        manualSwitch.setOnCheckedChangeListener { _, checked ->
            if (!syncingSwitch) send(Command.Mode(if (checked) ControlMode.MANUAL else ControlMode.AUTO))
        }

        val config = ConnectionActivity.brokerConfig(intent)
        status.text = getString(R.string.status_connecting, config.uri)
        link = MqttLink(this)
        link.connect(config, listOf(Topic.TELEMETRY))
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun bindDirection(id: Int, forward: Double, turn: Double) {
        val button = findViewById<View>(id)
        button.setOnTouchListener { v, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.isPressed = true
                    held = forward to turn
                    main.removeCallbacks(repeatMove)
                    repeatMove.run()
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.isPressed = false
                    if (event.actionMasked == MotionEvent.ACTION_UP) v.performClick()
                    if (held != null) {
                        release()
                        send(Command.Stop)
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun release() {
        held = null
        main.removeCallbacks(repeatMove)
    }

    private fun sendMove() {
        val (f, t) = held ?: return
        val s = speed.value.toDouble()
        send(Command.Move(f * s, t * s))
    }

    private fun send(cmd: Command) {
        if (!link.isConnected) {
            status.setText(R.string.status_disconnected)
            return
        }
        link.publish(Topic.CMD, ProtocolCodec.encodeCommand(cmd))
    }

    override fun onConnected(uri: String) {
        status.text = getString(R.string.status_connected, uri)
    }

    override fun onDisconnected(error: String?) {
        release()
        val text = if (error == null) getString(R.string.status_disconnected) else getString(R.string.status_error, error)
        status.text = text
        Snackbar.make(findViewById(R.id.root), text, Snackbar.LENGTH_LONG).show()
    }

    override fun onMessage(topic: String, payload: String) {
        if (topic != Topic.TELEMETRY) return
        val t = ProtocolCodec.decodeTelemetry(payload) ?: return
        telemetry.text = String.format(
            Locale.US,
            "x %.3f m   z %.3f m\nyaw %.2f rad\ndistance %s\ngait %s   mode %s",
            t.x, t.z, t.yaw,
            t.distance?.let { String.format(Locale.US, "%.3f m", it) } ?: "none",
            t.gait.wire, t.mode.wire,
        )
        val manual = t.mode == ControlMode.MANUAL
        if (manualSwitch.isChecked != manual) {
            syncingSwitch = true
            manualSwitch.isChecked = manual
            syncingSwitch = false
        }
    }

    override fun onPause() {
        // Never leave the body walking when the controller goes away.
        if (held != null) {
            release()
            send(Command.Stop)
        }
        super.onPause()
    }

    override fun onDestroy() {
        release()
        link.close()
        super.onDestroy()
    }

    companion object {
        private const val MOVE_REPEAT_MS = 200L
    }
}
