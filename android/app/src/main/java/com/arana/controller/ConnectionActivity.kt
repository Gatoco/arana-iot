package com.arana.controller

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText

class ConnectionActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_connection)

        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val host = findViewById<TextInputEditText>(R.id.host)
        val port = findViewById<TextInputEditText>(R.id.port)
        val user = findViewById<TextInputEditText>(R.id.broker_username)
        val pass = findViewById<TextInputEditText>(R.id.broker_password)
        val message = findViewById<TextView>(R.id.message)

        host.setText(prefs.getString(KEY_HOST, ""))
        port.setText(prefs.getInt(KEY_PORT, DEFAULT_PORT).toString())
        user.setText(prefs.getString(KEY_USER, ""))

        fun open(target: Class<*>) {
            val h = host.text?.toString()?.trim().orEmpty()
            val p = port.text?.toString()?.trim()?.toIntOrNull()
            if (h.isEmpty() || p == null || p !in 1..65535) {
                message.setText(R.string.error_host_port)
                return
            }
            message.text = ""
            val u = user.text?.toString()?.trim().orEmpty()
            // The broker password is never persisted.
            prefs.edit().putString(KEY_HOST, h).putInt(KEY_PORT, p).putString(KEY_USER, u).apply()
            startActivity(
                Intent(this, target)
                    .putExtra(EXTRA_HOST, h)
                    .putExtra(EXTRA_PORT, p)
                    .putExtra(EXTRA_USER, u)
                    .putExtra(EXTRA_PASS, pass.text?.toString().orEmpty())
            )
        }

        findViewById<MaterialButton>(R.id.open_control).setOnClickListener { open(ControlActivity::class.java) }
        findViewById<MaterialButton>(R.id.open_body_mode).setOnClickListener { open(BodyModeActivity::class.java) }
    }

    companion object {
        private const val PREFS = "connection"
        private const val KEY_HOST = "host"
        private const val KEY_PORT = "port"
        private const val KEY_USER = "username"
        const val DEFAULT_PORT = 1883
        private const val EXTRA_HOST = "host"
        private const val EXTRA_PORT = "port"
        private const val EXTRA_USER = "username"
        private const val EXTRA_PASS = "password"

        fun brokerConfig(intent: Intent): BrokerConfig = BrokerConfig(
            host = intent.getStringExtra(EXTRA_HOST).orEmpty(),
            port = intent.getIntExtra(EXTRA_PORT, DEFAULT_PORT),
            username = intent.getStringExtra(EXTRA_USER).orEmpty(),
            password = intent.getStringExtra(EXTRA_PASS).orEmpty(),
        )
    }
}
