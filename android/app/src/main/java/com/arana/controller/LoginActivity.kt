package com.arana.controller

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText

class LoginActivity : AppCompatActivity() {
    private lateinit var db: UserDb

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_login)
        db = UserDb(this)

        val username = findViewById<TextInputEditText>(R.id.username)
        val password = findViewById<TextInputEditText>(R.id.password)
        val message = findViewById<TextView>(R.id.message)

        fun credentials(): Pair<String, String>? {
            val u = username.text?.toString()?.trim().orEmpty()
            val p = password.text?.toString().orEmpty()
            if (u.isEmpty() || p.isEmpty()) {
                message.setText(R.string.error_empty_credentials)
                return null
            }
            return u to p
        }

        findViewById<MaterialButton>(R.id.sign_in).setOnClickListener {
            val (u, p) = credentials() ?: return@setOnClickListener
            if (db.verify(u, p)) {
                message.text = ""
                password.text = null
                startActivity(Intent(this, ConnectionActivity::class.java))
            } else {
                message.setText(R.string.error_bad_credentials)
            }
        }

        findViewById<MaterialButton>(R.id.create_account).setOnClickListener {
            val (u, p) = credentials() ?: return@setOnClickListener
            message.setText(
                when (db.create(u, p)) {
                    UserDb.CreateResult.CREATED -> R.string.account_created
                    UserDb.CreateResult.EXISTS -> R.string.error_user_exists
                    UserDb.CreateResult.INVALID -> R.string.error_empty_credentials
                }
            )
        }
    }

    override fun onDestroy() {
        db.close()
        super.onDestroy()
    }
}
