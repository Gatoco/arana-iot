package com.arana.controller

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface LoginUi {
    data object Idle : LoginUi
    data object Busy : LoginUi
    data class FormInvalid(val error: FormError) : LoginUi
    data class ConnectFailed(val error: ConnectError, val detail: String?) : LoginUi
    data object Done : LoginUi
}

class LoginViewModel(private val container: AppContainer) : ViewModel() {
    private val _ui = MutableStateFlow<LoginUi>(LoginUi.Idle)
    val ui: StateFlow<LoginUi> = _ui.asStateFlow()

    fun initialLogin(): StoredLogin = container.credentialsStore.load()

    fun submit(url: String, username: String, password: String, remember: Boolean) {
        if (_ui.value is LoginUi.Busy) return
        when (val form = LoginForm.validate(url, username, password)) {
            is FormResult.Invalid -> _ui.value = LoginUi.FormInvalid(form.error)
            is FormResult.Valid -> {
                _ui.value = LoginUi.Busy
                viewModelScope.launch {
                    container.link.connect(form.credentials).fold(
                        onSuccess = {
                            container.credentialsStore.save(url.trim(), form.credentials.username, password, remember)
                            _ui.value = LoginUi.Done
                        },
                        onFailure = {
                            val f = it as? ConnectFailure
                            _ui.value = LoginUi.ConnectFailed(f?.error ?: ConnectError.OTHER, f?.detail ?: it.message)
                        },
                    )
                }
            }
        }
    }

    /** Called after Main was started so a rotation does not navigate twice. */
    fun consumed() {
        _ui.value = LoginUi.Idle
    }

    class Factory(private val container: AppContainer) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = LoginViewModel(container) as T
    }
}
