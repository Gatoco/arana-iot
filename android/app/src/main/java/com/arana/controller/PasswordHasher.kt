package com.arana.controller

import java.security.MessageDigest
import java.security.SecureRandom

/** SHA-256(salt + password) with a random 16-byte salt per user. */
object PasswordHasher {
    const val SALT_BYTES = 16
    private val random = SecureRandom()

    fun newSalt(): ByteArray = ByteArray(SALT_BYTES).also { random.nextBytes(it) }

    fun hash(salt: ByteArray, password: String): ByteArray {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(salt)
        md.update(password.toByteArray(Charsets.UTF_8))
        return md.digest()
    }

    fun hashHex(salt: ByteArray, password: String): String = toHex(hash(salt, password))

    /** Constant-time comparison against the stored hex hash. */
    fun verify(password: String, salt: ByteArray, storedHex: String): Boolean {
        val expected = try {
            fromHex(storedHex)
        } catch (_: IllegalArgumentException) {
            return false
        }
        return MessageDigest.isEqual(hash(salt, password), expected)
    }

    fun toHex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    fun fromHex(hex: String): ByteArray {
        require(hex.length % 2 == 0) { "odd hex length" }
        return ByteArray(hex.length / 2) {
            val hi = Character.digit(hex[it * 2], 16)
            val lo = Character.digit(hex[it * 2 + 1], 16)
            require(hi >= 0 && lo >= 0) { "invalid hex" }
            ((hi shl 4) or lo).toByte()
        }
    }
}
