// Copyright (c) 2026 Dinovance
package cl.nido.parser

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/** Resultado esperado de un fixture; null en [Fixture.expected] significa "no es un movimiento". */
data class Expected(
    val amountClp: Long,
    val merchant: String?,
    val kind: Kind,
    val confidence: Confidence,
    val installment: Installment?,
)

/** Aviso SINTETICO (ver aviso en fixtures.json). */
data class Fixture(
    val id: String,
    val packageName: String,
    val title: String?,
    val text: String?,
    val postedAtMillis: Long,
    val expected: Expected?,
    val nota: String,
) {
    override fun toString() = id + (if (nota.isNotEmpty()) " ($nota)" else "")
}

object Fixtures {
    private val root: JsonObject by lazy {
        val stream = Fixtures::class.java.getResourceAsStream("/fixtures.json")
            ?: error("falta fixtures.json en los recursos de prueba")
        Json.parseToJsonElement(stream.readBytes().toString(Charsets.UTF_8)).jsonObject
    }

    val allowedPackages: Set<String> by lazy { root["allowedPackages"]!!.jsonArray.map { it.jsonPrimitive.content }.toSet() }

    val all: List<Fixture> by lazy { root["fixtures"]!!.jsonArray.map(::fixture) }

    fun byId(id: String): Fixture = all.first { it.id == id }

    /** Parser con la lista blanca de los fixtures. */
    fun parser() = NotificationParser(allowedPackages)

    private fun str(o: JsonObject, k: String): String? = o[k]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    private fun fixture(e: kotlinx.serialization.json.JsonElement): Fixture {
        val o = e.jsonObject
        require(o["sintetico"]?.jsonPrimitive?.content == "true") { "fixture no marcado como sintetico: ${o["id"]}" }
        val exp = o["expected"]?.takeIf { it !is JsonNull }?.jsonObject?.let { x ->
            Expected(
                amountClp = x["amountClp"]!!.jsonPrimitive.long,
                merchant = str(x, "merchant"),
                kind = Kind.valueOf(x["kind"]!!.jsonPrimitive.content),
                confidence = Confidence.valueOf(x["confidence"]!!.jsonPrimitive.content),
                installment = x["installment"]?.takeIf { it !is JsonNull }?.jsonObject?.let {
                    Installment(it["n"]!!.jsonPrimitive.int, it["total"]!!.jsonPrimitive.int)
                },
            )
        }
        return Fixture(
            id = str(o, "id")!!,
            packageName = str(o, "packageName")!!,
            title = str(o, "title"),
            text = str(o, "text"),
            postedAtMillis = o["postedAtMillis"]!!.jsonPrimitive.long,
            expected = exp,
            nota = str(o, "nota") ?: "",
        )
    }
}
