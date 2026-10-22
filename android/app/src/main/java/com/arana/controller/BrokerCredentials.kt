package com.arana.controller

/** Broker login. [toString] is redacted so the password can never reach a log or crash report. */
data class BrokerCredentials(val url: BrokerUrl, val username: String, val password: String) {
    override fun toString(): String = "BrokerCredentials(url=${url.display()}, username=$username, password=***)"
}

enum class FormError { URL_EMPTY, URL_INVALID, USERNAME_EMPTY, PASSWORD_EMPTY }

sealed interface FormResult {
    data class Valid(val credentials: BrokerCredentials) : FormResult
    data class Invalid(val error: FormError) : FormResult
}

/** Raw login form values. URL and username are trimmed; the password is used as typed. */
object LoginForm {
    fun validate(url: String, username: String, password: String): FormResult {
        val trimmedUrl = url.trim()
        if (trimmedUrl.isEmpty()) return FormResult.Invalid(FormError.URL_EMPTY)
        val parsed = BrokerUrl.parse(trimmedUrl) ?: return FormResult.Invalid(FormError.URL_INVALID)
        val user = username.trim()
        if (user.isEmpty()) return FormResult.Invalid(FormError.USERNAME_EMPTY)
        if (password.isEmpty()) return FormResult.Invalid(FormError.PASSWORD_EMPTY)
        return FormResult.Valid(BrokerCredentials(parsed, user, password))
    }
}
