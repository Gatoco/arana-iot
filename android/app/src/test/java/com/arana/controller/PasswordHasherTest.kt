package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PasswordHasherTest {
    private val saltA = ByteArray(16) { it.toByte() }
    private val saltB = ByteArray(16) { (it + 1).toByte() }

    @Test
    fun samePasswordAndSaltGiveSameHash() {
        assertEquals(PasswordHasher.hashHex(saltA, "secret"), PasswordHasher.hashHex(saltA, "secret"))
    }

    @Test
    fun differentSaltGivesDifferentHash() {
        assertNotEquals(PasswordHasher.hashHex(saltA, "secret"), PasswordHasher.hashHex(saltB, "secret"))
    }

    @Test
    fun hashIsSha256OfSaltThenPassword() {
        val md = java.security.MessageDigest.getInstance("SHA-256")
        md.update(saltA)
        md.update("secret".toByteArray(Charsets.UTF_8))
        val expected = md.digest().joinToString("") { "%02x".format(it) }
        assertEquals(expected, PasswordHasher.hashHex(saltA, "secret"))
    }

    @Test
    fun verifyAcceptsCorrectAndRejectsWrongPassword() {
        val stored = PasswordHasher.hashHex(saltA, "secret")
        assertTrue(PasswordHasher.verify("secret", saltA, stored))
        assertFalse(PasswordHasher.verify("Secret", saltA, stored))
    }

    @Test
    fun newSaltIs16RandomBytes() {
        val a = PasswordHasher.newSalt()
        val b = PasswordHasher.newSalt()
        assertEquals(16, a.size)
        assertFalse(a.contentEquals(b))
    }

    @Test
    fun hexRoundTrip() {
        assertTrue(saltA.contentEquals(PasswordHasher.fromHex(PasswordHasher.toHex(saltA))))
    }
}
