package com.arana.controller

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.arana.controller.databinding.FragmentServosBinding
import com.arana.controller.databinding.ItemServoCellBinding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch

/** Read-only 4x2 joint matrix from telemetry. No setters: the firmware has no per-servo MQTT command. */
class ServosFragment : Fragment() {
    private var _b: FragmentServosBinding? = null
    private val b get() = _b!!
    private val link get() = (requireActivity().application as AranaApp).container.link
    private val cells = mutableListOf<ItemServoCellBinding>()

    override fun onCreateView(i: LayoutInflater, c: ViewGroup?, s: Bundle?): View {
        _b = FragmentServosBinding.inflate(i, c, false)
        return b.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        val legs = listOf("FL", "FR", "RL", "RR")
        val dp = resources.displayMetrics.density
        for (leg in legs.indices) {
            val row = LinearLayout(requireContext()).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(0, (8 * dp).toInt(), 0, (8 * dp).toInt())
            }
            row.addView(TextView(requireContext()).apply {
                text = legs[leg]
                setTextAppearance(R.style.Arana_Mono)
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                minWidth = (36 * dp).toInt()
            })
            for (j in 0..1) {
                val cell = ItemServoCellBinding.inflate(layoutInflater, row, false)
                cell.jointName.text = if (j == 0) "hip" else "knee"
                val lp = cell.root.layoutParams as LinearLayout.LayoutParams
                lp.marginStart = (12 * dp).toInt()
                cells += cell
                row.addView(cell.root)
            }
            b.servoRows.addView(row)
        }
        b.channelMapButton.setOnClickListener {
            MaterialAlertDialogBuilder(requireContext())
                .setTitle(R.string.channel_map_title)
                .setMessage(R.string.channel_map_body)
                .setPositiveButton(R.string.close, null)
                .show()
                .also { d -> d.findViewById<TextView>(android.R.id.message)?.typeface = android.graphics.Typeface.MONOSPACE }
        }
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                link.telemetry.collect(::render)
            }
        }
    }

    private fun render(t: Telemetry?) {
        for (i in 0 until SERVO_COUNT) {
            val cell = cells.getOrNull(i) ?: continue
            val v = t?.joints?.getOrNull(i)
            cell.jointValue.text = if (v == null) getString(R.string.no_value) else UiFormat.degrees(v)
            cell.jointBar.set(v, ServoMath.range(i), v?.let { ServoMath.status(i, it) })
            cell.jointBar.contentDescription = ServoMath.NAMES[i]
        }
    }

    override fun onDestroyView() {
        cells.clear()
        _b = null
        super.onDestroyView()
    }
}
