package com.arana.controller

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Values shown in the login form. */
data class StoredLogin(val url: String, val username: String, val password: String, val remember: Boolean)

/**
 * Remembered broker login in [EncryptedSharedPreferences] (AES256-GCM master key).
 * If the keystore is unusable the store degrades to the demo defaults and never throws.
 */
class BrokerCredentialsStore(context: Context, private val defaults: StoredLogin) {
    private val prefs = try {
        val key = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            FILE,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    } catch (_: Exception) {
        null
    }

    fun load(): StoredLogin {
        val p = prefs ?: return defaults
        return try {
            if (!p.contains(KEY_URL)) defaults
            else StoredLogin(
                url = p.getString(KEY_URL, null) ?: defaults.url,
                username = p.getString(KEY_USER, null) ?: defaults.username,
                password = p.getString(KEY_PASS, null) ?: "",
                remember = p.getBoolean(KEY_REMEMBER, true),
            )
        } catch (_: Exception) {
            defaults
        }
    }

    /** Saves URL and username always; the password only when [remember], otherwise it is cleared. */
    fun save(url: String, username: String, password: String, remember: Boolean) {
        val p = prefs ?: return
        try {
            p.edit().apply {
                putString(KEY_URL, url)
                putString(KEY_USER, username)
                putBoolean(KEY_REMEMBER, remember)
                if (remember) putString(KEY_PASS, password) else remove(KEY_PASS)
            }.apply()
        } catch (_: Exception) {
            // Keystore failure: skip persistence, never crash the login.
        }
    }

    private companion object {
        const val FILE = "arana_broker_login"
        const val KEY_URL = "server_url"
        const val KEY_USER = "username"
        const val KEY_PASS = "password"
        const val KEY_REMEMBER = "remember"
    }
}
