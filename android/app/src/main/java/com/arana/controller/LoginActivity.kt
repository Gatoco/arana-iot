package com.arana.controller

import android.content.Intent
import android.os.Bundle
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import androidx.lifecycle.ViewModelProvider
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.arana.controller.databinding.ActivityLoginBinding
import kotlinx.coroutines.launch

/** Single entry point: a real MQTT CONNECT against the broker, nothing else. */
class LoginActivity : AppCompatActivity() {
    private lateinit var b: ActivityLoginBinding
    private val container get() = (application as AranaApp).container
    private val vm: LoginViewModel by lazy {
        ViewModelProvider(this, LoginViewModel.Factory(container))[LoginViewModel::class.java]
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(b.root)

        if (savedInstanceState == null) {
            val s = vm.initialLogin()
            b.urlInput.setText(s.url)
            b.userInput.setText(s.username)
            b.passInput.setText(s.password)
            b.rememberCheck.isChecked = s.remember
        }

        b.connectButton.setOnClickListener { submit() }
        b.passInput.setOnEditorActionListener { _, id, _ ->
            if (id == EditorInfo.IME_ACTION_DONE) { submit(); true } else false
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) { vm.ui.collect(::render) }
        }
    }

    private fun submit() {
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(b.root.windowToken, 0)
        vm.submit(
            b.urlInput.text?.toString().orEmpty(),
            b.userInput.text?.toString().orEmpty(),
            b.passInput.text?.toString().orEmpty(),
            b.rememberCheck.isChecked,
        )
    }

    private fun render(ui: LoginUi) {
        val busy = ui is LoginUi.Busy
        b.progress.visibility = if (busy) android.view.View.VISIBLE else android.view.View.INVISIBLE
        b.connectButton.isEnabled = !busy
        b.connectButton.setText(if (busy) R.string.connecting else R.string.connect)
        for (l in listOf(b.urlLayout, b.userLayout, b.passLayout)) l.isEnabled = !busy
        b.rememberCheck.isEnabled = !busy

        val message: String? = when (ui) {
            is LoginUi.FormInvalid -> getString(
                when (ui.error) {
                    FormError.URL_EMPTY -> R.string.err_url_empty
                    FormError.URL_INVALID -> R.string.err_url_invalid
                    FormError.USERNAME_EMPTY -> R.string.err_username_empty
                    FormError.PASSWORD_EMPTY -> R.string.err_password_empty
                },
            )
            is LoginUi.ConnectFailed -> when (ui.error) {
                ConnectError.BAD_CREDENTIALS -> getString(R.string.err_bad_credentials)
                ConnectError.UNREACHABLE -> getString(R.string.err_unreachable)
                ConnectError.TLS -> getString(R.string.err_tls)
                ConnectError.REFUSED -> getString(R.string.err_refused)
                ConnectError.INVALID_URL -> getString(R.string.err_invalid_url)
                ConnectError.OTHER -> getString(R.string.err_other, ui.detail ?: "unknown error")
            }
            else -> null
        }
        b.errorText.text = message
        b.errorText.visibility = if (message != null) android.view.View.VISIBLE else android.view.View.GONE

        if (ui is LoginUi.Done) {
            vm.consumed()
            startActivity(Intent(this, MainActivity::class.java))
            finish()
        }
    }
}
