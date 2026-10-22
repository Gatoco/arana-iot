package com.arana.controller

import android.content.Context
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.Locale

object UiFormat {
    fun ticker(everyMs: Long): Flow<Unit> = flow {
        while (true) {
            emit(Unit)
            delay(everyMs)
        }
    }

    fun stateLabel(c: Context, s: LinkState): String = c.getString(
        when (s) {
            LinkState.Connected -> R.string.state_connected
            LinkState.Connecting -> R.string.state_connecting
            is LinkState.Reconnecting -> R.string.state_reconnecting
            LinkState.Disconnected -> R.string.state_disconnected
            is LinkState.Failed -> R.string.state_failed
        },
    )

    fun dotColor(c: Context, s: LinkState): Int = ContextCompat.getColor(
        c,
        when (s) {
            LinkState.Connected -> R.color.success
            LinkState.Connecting, is LinkState.Reconnecting -> R.color.warning
            else -> R.color.danger
        },
    )

    fun modeLabel(c: Context, t: Telemetry?): String = when (t?.mode) {
        ControlMode.AUTO -> c.getString(R.string.mode_auto)
        ControlMode.MANUAL -> c.getString(R.string.mode_manual)
        null -> c.getString(R.string.mode_none)
    }

    /** Seconds since [lastAt], or null when no packet was ever received. */
    fun ageSeconds(lastAt: Long, now: Long): Double? = if (lastAt == 0L) null else (now - lastAt) / 1000.0

    fun age(c: Context, lastAt: Long, now: Long): String {
        val a = ageSeconds(lastAt, now) ?: return c.getString(R.string.conn_no_telemetry)
        return c.getString(R.string.conn_last_packet, a)
    }

    fun num(v: Double, decimals: Int = 2): String = String.format(Locale.US, "%.${decimals}f", v)

    fun degrees(v: Double): String = String.format(Locale.US, "%.0f°", v)
}
