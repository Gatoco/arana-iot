package com.arana.controller

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Local accounts: username, per-user salt and SHA-256(salt + password), all hex. */
class UserDb(context: Context) : SQLiteOpenHelper(context, "users.db", null, 1) {

    enum class CreateResult { CREATED, EXISTS, INVALID }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE users (username TEXT PRIMARY KEY NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL)"
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun create(username: String, password: String): CreateResult {
        if (username.isBlank() || password.isEmpty()) return CreateResult.INVALID
        val salt = PasswordHasher.newSalt()
        val values = ContentValues().apply {
            put("username", username)
            put("salt", PasswordHasher.toHex(salt))
            put("hash", PasswordHasher.hashHex(salt, password))
        }
        val id = writableDatabase.insertWithOnConflict("users", null, values, SQLiteDatabase.CONFLICT_IGNORE)
        return if (id == -1L) CreateResult.EXISTS else CreateResult.CREATED
    }

    fun verify(username: String, password: String): Boolean {
        if (username.isBlank() || password.isEmpty()) return false
        readableDatabase.query(
            "users", arrayOf("salt", "hash"), "username = ?", arrayOf(username), null, null, null
        ).use { c ->
            if (!c.moveToFirst()) return false
            val salt = try {
                PasswordHasher.fromHex(c.getString(0))
            } catch (_: IllegalArgumentException) {
                return false
            }
            return PasswordHasher.verify(password, salt, c.getString(1))
        }
    }
}
