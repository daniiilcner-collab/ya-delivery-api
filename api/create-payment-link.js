// api/create-payment-link.js
// Создаёт платёжную ссылку через Точка Банк
//
// Переменные окружения в Vercel:
//   TOCHKA_TOKEN         — JWT-токен
//   TOCHKA_CUSTOMER_CODE — 305428357
//   TOCHKA_MERCHANT_ID   — 200000000035707
//   UNIT_PRICE           — цена за 1 штуку в рублях (например: 1301)
//
// POST /api/create-payment-link
// Body: { quantity, customerName, customerPhone }
// Response: { paymentUrl, paymentLinkId }

const TOCHKA_API = "https://enter.tochka.com/uapi"
const SUCCESS_URL = "https://yakovleva-shop.ru/succes-pay"

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    const { quantity, customerName, customerPhone } = req.body

    if (!quantity || !customerName || !customerPhone) {
        return res.status(400).json({ error: "Missing required fields" })
    }

    const TOKEN = process.env.TOCHKA_TOKEN
    const CUSTOMER_CODE = process.env.TOCHKA_CUSTOMER_CODE
    const MERCHANT_ID = process.env.TOCHKA_MERCHANT_ID

    // ✅ Цена только из env — фронт не может её подменить
    const unitPrice = Number(process.env.UNIT_PRICE) || 1301
    const amount = Number(quantity) * unitPrice
    const orderId = `order-${Date.now()}`

    const payload = {
        Data: {
            customerCode: CUSTOMER_CODE,
            merchantId: MERCHANT_ID,
            amount: String(amount) + ".00",
            purpose: `стикеры яковлева — ${quantity} шт.`,
            paymentMode: ["card", "sbp"],
            redirectUrl: SUCCESS_URL,
            paymentLinkId: orderId,
            ttl: 60,
        }
    }

    console.log("Sending to Tochka:", JSON.stringify(payload))

    try {
        const response = await fetch(
            `${TOCHKA_API}/acquiring/v1.0/payments`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${TOKEN}`,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                body: JSON.stringify(payload),
            }
        )

        const data = await response.json()
        console.log("Tochka response:", response.status, JSON.stringify(data))

        if (!response.ok) {
            return res.status(response.status).json({ error: "Tochka API error", details: data })
        }

        // Точка возвращает Data.paymentLink (не paymentUrl!)
        const paymentUrl = data?.Data?.paymentLink
        if (!paymentUrl) {
            return res.status(500).json({ error: "No paymentUrl in response", raw: data })
        }

        return res.status(200).json({ paymentUrl, paymentLinkId: orderId })

    } catch (err) {
        console.error("Fetch error:", err)
        return res.status(500).json({ error: err.message })
    }
}
