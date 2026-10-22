package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginFormTest {
    private val url = "wss://mqtt.t420.dev/mqtt"

    @Test
    fun validFormBuildsCredentials() {
        val r = LoginForm.validate(url, "conectoma", "cont1234") as FormResult.Valid
        assertEquals("conectoma", r.credentials.username)
        assertEquals("cont1234", r.credentials.password)
        assertEquals(443, r.credentials.url.port)
    }

    @Test
    fun emptyFieldsAreRejected() {
        assertEquals(FormResult.Invalid(FormError.URL_EMPTY), LoginForm.validate("  ", "u", "p"))
        assertEquals(FormResult.Invalid(FormError.USERNAME_EMPTY), LoginForm.validate(url, "   ", "p"))
        assertEquals(FormResult.Invalid(FormError.PASSWORD_EMPTY), LoginForm.validate(url, "u", ""))
    }

    @Test
    fun invalidUrlIsRejected() {
        assertEquals(FormResult.Invalid(FormError.URL_INVALID), LoginForm.validate("mqtt.t420.dev", "u", "p"))
    }

    @Test
    fun urlAndUsernameAreTrimmedPasswordIsNot() {
        val r = LoginForm.validate("  $url  ", "  conectoma  ", "  pw  ") as FormResult.Valid
        assertEquals("conectoma", r.credentials.username)
        assertEquals("  pw  ", r.credentials.password)
    }

    @Test
    fun whitespaceOnlyPasswordIsAccepted() {
        assertTrue(LoginForm.validate(url, "u", " ") is FormResult.Valid)
    }

    @Test
    fun credentialsToStringIsRedacted() {
        val r = LoginForm.validate(url, "conectoma", "cont1234") as FormResult.Valid
        val s = r.credentials.toString()
        assertFalse(s.contains("cont1234"))
        assertTrue(s.contains("conectoma"))
    }
}
