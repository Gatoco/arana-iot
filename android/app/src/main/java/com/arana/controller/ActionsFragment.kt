package com.arana.controller

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.GridLayout
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.arana.controller.databinding.FragmentActionsBinding
import com.google.android.material.button.MaterialButton
import com.google.android.material.snackbar.Snackbar
import kotlinx.coroutines.launch

/** Nine firmware actions, one command per press. */
class ActionsFragment : Fragment() {
    private var _b: FragmentActionsBinding? = null
    private val b get() = _b!!
    private val link get() = (requireActivity().application as AranaApp).container.link
    private val buttons = mutableListOf<MaterialButton>()

    override fun onCreateView(i: LayoutInflater, c: ViewGroup?, s: Bundle?): View {
        _b = FragmentActionsBinding.inflate(i, c, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val dp = resources.displayMetrics.density
        for (pose in Pose.entries) {
            val btn = MaterialButton(requireContext()).apply {
                text = pose.label
                textSize = 14f
                maxLines = 2
                contentDescription = pose.label
                layoutParams = GridLayout.LayoutParams(GridLayout.spec(GridLayout.UNDEFINED, 1f), GridLayout.spec(GridLayout.UNDEFINED, 1f)).apply {
                    width = 0
                    height = (72 * dp).toInt()
                    setMargins((4 * dp).toInt(), (4 * dp).toInt(), (4 * dp).toInt(), (4 * dp).toInt())
                }
                setOnClickListener { send(pose) }
            }
            buttons += btn
            b.poseGrid.addView(btn)
        }
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                link.state.collect { s -> buttons.forEach { it.isEnabled = s is LinkState.Connected } }
            }
        }
    }

    private fun send(pose: Pose) {
        val unconfirmed = !link.bodyAlive()
        val sent = link.publish(Command.Pose(pose))
        val msg = when {
            !sent -> getString(R.string.not_connected)
            unconfirmed -> getString(R.string.sent_pose_unconfirmed, pose.label)
            else -> getString(R.string.sent_pose, pose.label)
        }
        Snackbar.make(b.root, msg, Snackbar.LENGTH_SHORT).show()
    }

    override fun onDestroyView() {
        buttons.clear()
        _b = null
        super.onDestroyView()
    }
}
