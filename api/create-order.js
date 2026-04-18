// api/create-order.js
// Создаёт заказ в Яндекс Доставке + уведомление в Telegram
// Шаг 1: получаем офферы → Шаг 2: подтверждаем первый → Шаг 3: Telegram

const YA_API = "https://b2b-authproxy.taxi.yandex.net"
const SOURCE_STATION_ID = "019d88a8fe007763a71caf9d7ec05c0e" // самопривоз: Северск, Курчатова 36Б

// Отправка уведомления в Telegram
async function sendTelegram(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (!token || !chatId) {
        console.error("Telegram env не настроен")
        return
    }
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "HTML",
            }),
        })
    } catch (err) {
        console.error("Telegram ошибка:", err)
    }
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    const { destinationId, deliveryAddress, customerName, customerPhone, quantity } = req.body

    const token = process.env.YA_DELIVERY_TOKEN
    const clientId = process.env.YA_CLIENT_ID
    const unitPrice = Number(process.env.UNIT_PRICE || 1301)
    const totalPrice = unitPrice * Number(quantity)

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Client-ID": clientId,
    }

    const body = {
        info: {
            operator_request_id: `order-${Date.now()}`,
        },
        source: {
            platform_station: {
                platform_id: SOURCE_STATION_ID,
            },
        },
        destination: {
            type: "platform_station",
            platform_station: {
                platform_id: destinationId,
            },
        },
        items: [
            {
                count: Number(quantity),
                name: "стикеры яковлева",
                article: "STICKER-001",
                billing_details: {
                    inn: process.env.SELLER_INN || "000000000000",
                    nds: -1,
                    unit_price: unitPrice * 100,
                    assessed_unit_price: unitPrice * 100,
                },
                place_barcode: "PLACE-001",
                physical_dims: {
                    predefined_volume: 500,
                },
            },
        ],
        places: [
            {
                barcode: "PLACE-001",
                physical_dims: {
                    weight_gross: 60 * Number(quantity),
                    dx: 15,
                    dy: 10,
                    dz: 1,
                },
            },
        ],
        billing_info: {
            payment_method: "already_paid",
            delivery_cost: 0,
        },
        recipient_info: {
            first_name: customerName,
            phone: customerPhone,
            email: "",
        },
        last_mile_policy: "self_pickup",
    }

    try {
        // ШАГ 1 — получаем офферы
        const offersRes = await fetch(`${YA_API}/api/b2b/platform/offers/create`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        })

        const offersData = await offersRes.json()

        if (!offersRes.ok) {
            // ЯД вернул ошибку на первом шаге
            await sendTelegram(
`🛍 <b>новый заказ!</b>

👤 ${customerName}
📞 ${customerPhone}
📦 ${quantity} шт × ${unitPrice} = ${totalPrice} руб
📍 ПВЗ: ${deliveryAddress || destinationId}

⚠️ <b>ошибка яндекс доставки — нужна ручная обработка!</b>
❗ причина: ${offersData?.message || JSON.stringify(offersData)}`
            )
            return res.status(offersRes.status).json({ error: "offers_create_failed", details: offersData })
        }

        const firstOffer = offersData?.offers?.[0]
        if (!firstOffer) {
            await sendTelegram(
`🛍 <b>новый заказ!</b>

👤 ${customerName}
📞 ${customerPhone}
📦 ${quantity} шт × ${unitPrice} = ${totalPrice} руб
📍 ПВЗ: ${deliveryAddress || destinationId}

⚠️ <b>яндекс не вернул офферы — нужна ручная обработка!</b>`
            )
            return res.status(500).json({ error: "no_offers_returned" })
        }

        // ШАГ 2 — подтверждаем первый оффер
        const confirmRes = await fetch(`${YA_API}/api/b2b/platform/offers/confirm`, {
            method: "POST",
            headers,
            body: JSON.stringify({ offer_id: firstOffer.offer_id }),
        })

        const confirmData = await confirmRes.json()

        if (!confirmRes.ok) {
            // Офферы получили, но подтверждение упало
            await sendTelegram(
`🛍 <b>новый заказ!</b>

👤 ${customerName}
📞 ${customerPhone}
📦 ${quantity} шт × ${unitPrice} = ${totalPrice} руб
📍 ПВЗ: ${deliveryAddress || destinationId}

⚠️ <b>ошибка подтверждения яндекс доставки — нужна ручная обработка!</b>
❗ причина: ${confirmData?.message || JSON.stringify(confirmData)}
🔑 offer_id: ${firstOffer.offer_id}`
            )
            return res.status(confirmRes.status).json({ error: "offer_confirm_failed", details: confirmData })
        }

        // ШАГ 3 — всё прошло, отправляем уведомление об успехе
        const formatDate = (iso) => {
            if (!iso) return "—"
            const [y, m, d] = iso.substring(0, 10).split("-")
            return `${d}-${m}-${y}`
        }
        const deliveryDate = formatDate(firstOffer.offer_details?.delivery_interval?.min)
        const pickupDeadline = formatDate(firstOffer.offer_details?.pickup_interval?.max)

        await sendTelegram(
`🛍 <b>новый заказ!</b>

👤 ${customerName}
📞 ${customerPhone}
📦 ${quantity} шт × ${unitPrice} = ${totalPrice} руб
📍 ПВЗ: ${deliveryAddress || destinationId}

✅ <b>яндекс доставка: заказ создан</b>
🆔 заказ ЯД: ${confirmData.request_id}
💰 стоимость доставки: ${firstOffer.offer_details?.pricing}
📅 дата доставки покупателю: ${deliveryDate}
🚚 привезти в ПВЗ самопривоза до: ${pickupDeadline}`
        )

        return res.status(200).json({
            success: true,
            request_id: confirmData.request_id,
            offer: {
                offer_id: firstOffer.offer_id,
                pricing: firstOffer.offer_details?.pricing,
                delivery_interval: firstOffer.offer_details?.delivery_interval,
                pickup_interval: firstOffer.offer_details?.pickup_interval,
            },
        })

    } catch (err) {
        // Сеть или непредвиденная ошибка
        await sendTelegram(
`🛍 <b>новый заказ!</b>

👤 ${customerName}
📞 ${customerPhone}
📦 ${quantity} шт × ${unitPrice} = ${totalPrice} руб
📍 ПВЗ: ${deliveryAddress || destinationId}

🔴 <b>критическая ошибка — нужна ручная обработка!</b>
❗ ${err.message}`
        )
        console.error("Fetch error:", err)
        return res.status(500).json({ error: err.message })
    }
}
