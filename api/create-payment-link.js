// api/create-payment-link.js
// Создаёт платёжную ссылку через Точка Банк и возвращает URL для редиректа
//
// Переменные окружения в Vercel:
//   TOCHKA_TOKEN     — JWT-токен из личного кабинета Точки
//   TOCHKA_CUSTOMER_CODE — 305428357
//   TOCHKA_MERCHANT_ID   — 200000000035707
//
// POST /api/create-payment-link
// Body: { quantity: number, unitPrice: number, customerName: string, customerPhone: string }
// Response: { paymentUrl: string, paymentLinkId: string }

export const config = { runtime: "edge" }

const TOCHKA_API = "https://enter.tochka.com/uapi"
const CUSTOMER_CODE = process.env.TOCHKA_CUSTOMER_CODE
const MERCHANT_ID = process.env.TOCHKA_MERCHANT_ID
const TOKEN = process.env.TOCHKA_TOKEN

// URL куда Точка редиректит покупателя после оплаты
const SUCCESS_URL = "https://yakovleva-shop.ru/success"
const FAIL_URL = "https://yakovleva-shop.ru/failure"

export default async function handler(req) {
    // CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders(),
        })
    }

    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405)
    }

    let body
    try {
        body = await req.json()
    } catch {
        return json({ error: "Invalid JSON" }, 400)
    }

    const { quantity, unitPrice, customerName, customerPhone } = body

    // Валидация
    if (!quantity || !unitPrice || !customerName || !customerPhone) {
        return json({ error: "Missing required fields" }, 400)
    }

    const amount = quantity * unitPrice // сумма в рублях
    const orderId = `order-${Date.now()}` // уникальный ID заказа

    // Тело запроса к Точке
    // Используем With Receipt т.к. подключена касса digitalKassaTochka
    const payload = {
        customerCode: CUSTOMER_CODE,
        merchantId: MERCHANT_ID,
        amount: amount,
        purpose: `стикеры яковлева — ${quantity} шт.`,
        paymentMode: ["card", "sbp"],
        redirectUrl: SUCCESS_URL,
        failRedirectUrl: FAIL_URL,
        paymentLinkId: orderId,
        ttl: 60, // ссылка живёт 60 минут

        // Данные для фискального чека (54-ФЗ)
        // Касса: digitalKassaTochka — Точка сама отправит чек покупателю
        Client: {
            name: customerName,
            phone: customerPhone,
        },
        Items: [
            {
                name: "стикеры яковлева",
                amount: unitPrice,   // цена за 1 шт.
                quantity: quantity,
                paymentMethod: "full_payment",
                paymentObject: "goods",
                vatType: "none",     // без НДС — для ИП на УСН
            },
        ],
    }

    try {
        const response = await fetch(
            `${TOCHKA_API}/acquiring/v1.0/payments/with-receipt`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        )

        const data = await response.json()

        if (!response.ok) {
            console.error("Точка API error:", JSON.stringify(data))
            return json(
                { error: "Payment link creation failed", details: data },
                response.status
            )
        }

        // Точка возвращает paymentUrl — редиректим туда пользователя
        const paymentUrl = data?.Data?.paymentUrl || data?.paymentUrl
        if (!paymentUrl) {
            console.error("No paymentUrl in response:", JSON.stringify(data))
            return json({ error: "No paymentUrl in response", raw: data }, 500)
        }

        return json({ paymentUrl, paymentLinkId: orderId })

    } catch (err) {
        console.error("Fetch error:", err)
        return json({ error: "Internal server error", message: err.message }, 500)
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders(),
        },
    })
}

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
}
