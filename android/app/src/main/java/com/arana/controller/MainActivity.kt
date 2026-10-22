package com.arana.controller

import android.content.Intent
import android.content.res.ColorStateList
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.arana.controller.databinding.ActivityMainBinding
import com.arana.controller.databinding.DialogConnectionBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    private lateinit var b: ActivityMainBinding
    private val container get() = (application as AranaApp).container
    private val link get() = container.link

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Main never opens without a live broker session (e.g. after process death).
        if (link.currentState() !is LinkState.Connected && link.currentState() !is LinkState.Reconnecting) {
            goToLogin()
            return
        }
        b = ActivityMainBinding.inflate(layoutInflater)
        setContentView(b.root)
        setSupportActionBar(b.toolbar)
        supportActionBar?.setDisplayShowTitleEnabled(true)

        b.bottomNav.setOnItemSelectedListener { item ->
            show(
                when (item.itemId) {
                    R.id.nav_actions -> ActionsFragment()
                    R.id.nav_servos -> ServosFragment()
                    else -> ConsoleFragment()
                },
            )
            true
        }
        if (savedInstanceState == null) {
            show(ConsoleFragment())
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                combine(link.state, link.telemetry) { s, t -> s to t }.collect { (s, t) -> renderToolbar(s, t) }
            }
        }
    }

    private fun show(f: Fragment) {
        supportFragmentManager.beginTransaction().replace(R.id.fragmentContainer, f).commit()
    }

    private fun renderToolbar(s: LinkState, t: Telemetry?) {
        val label = UiFormat.stateLabel(this, s)
        b.connDot.backgroundTintList = ColorStateList.valueOf(UiFormat.dotColor(this, s))
        b.connDot.contentDescription = getString(R.string.cd_connection_dot, label)
        b.modeBadge.text = UiFormat.modeLabel(this, t)
        when (s) {
            LinkState.Connected -> b.linkBanner.visibility = View.GONE
            is LinkState.Reconnecting -> showBanner(R.string.banner_reconnecting, R.color.warning)
            else -> showBanner(R.string.banner_disconnected, R.color.danger)
        }
    }

    private fun showBanner(text: Int, color: Int) {
        b.linkBanner.setText(text)
        b.linkBanner.setBackgroundColor(getColor(color))
        b.linkBanner.visibility = View.VISIBLE
    }

    override fun onStop() {
        // Safety stop: leaving the screen must never leave the body walking.
        if (::b.isInitialized && link.currentState() is LinkState.Connected) link.publish(Command.Stop)
        super.onStop()
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean = when (item.itemId) {
        R.id.menu_connection -> { showConnectionDialog(); true }
        R.id.menu_body -> { confirmBodyMode(); true }
        R.id.menu_logout -> { logout(); true }
        else -> super.onOptionsItemSelected(item)
    }

    private fun showConnectionDialog() {
        val d = DialogConnectionBinding.inflate(layoutInflater)
        val dialog = MaterialAlertDialogBuilder(this).setTitle(R.string.conn_title).setView(d.root).create()
        var job: Job? = null
        fun refresh(s: LinkState, lastAt: Long) {
            d.dlgState.text = getString(R.string.conn_state) + ": " + UiFormat.stateLabel(this, s)
            val session = link.session.value
            d.dlgServer.text = getString(R.string.conn_server) + ": " + (session?.serverDisplay ?: "--")
            d.dlgUser.text = getString(R.string.conn_user) + ": " + (session?.username ?: "--")
            d.dlgTelemetry.text = getString(R.string.conn_telemetry) + ": " + UiFormat.age(this, lastAt, link.nowMs())
            d.dlgDisconnect.isEnabled = s is LinkState.Connected || s is LinkState.Reconnecting
        }
        job = lifecycleScope.launch {
            combine(link.state, link.lastTelemetryAt, UiFormat.ticker(500)) { s, t, _ -> s to t }
                .collect { (s, t) -> refresh(s, t) }
        }
        d.dlgDisconnect.setOnClickListener { link.disconnect(sendStop = true) }
        d.dlgLogout.setOnClickListener { dialog.dismiss(); logout() }
        d.dlgBody.setOnClickListener { dialog.dismiss(); confirmBodyMode() }
        d.dlgClose.setOnClickListener { dialog.dismiss() }
        dialog.setOnDismissListener { job?.cancel() }
        dialog.show()
    }

    private fun confirmBodyMode() {
        MaterialAlertDialogBuilder(this)
            .setTitle(R.string.body_warning_title)
            .setMessage(R.string.body_warning)
            .setPositiveButton(R.string.continue_action) { _, _ ->
                startActivity(Intent(this, BodyModeActivity::class.java))
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun logout() {
        link.disconnect(sendStop = true)
        goToLogin()
    }

    private fun goToLogin() {
        startActivity(Intent(this, LoginActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK or Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }
}
