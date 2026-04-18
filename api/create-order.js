// api/create-order.js
// Создаёт заказ в Яндекс Доставке (самопривоз → ПВЗ)
// 2 шага: 1) получаем офферы 2) подтверждаем первый

const YA_API = "https://b2b-authproxy.taxi.yandex.net"
const SOURCE_STATION_ID = "019d88a8fe007763a71caf9d7ec05c0e" // ПВЗ самопривоза: Северск, Курчатова 36Б

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    const { destinationId, customerName, customerPhone, quantity } = req.body

    const token = process.env.YA_DELIVERY_TOKEN
    const clientId = process.env.YA_CLIENT_ID

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
                    unit_price: Number(process.env.UNIT_PRICE || 1301) * 100,
                    assessed_unit_price: Number(process.env.UNIT_PRICE || 1301) * 100,
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
        console.log("Offers status:", offersRes.status)

        if (!offersRes.ok) {
            return res.status(offersRes.status).json({
                error: "offers_create_failed",
                details: offersData,
            })
        }

        const firstOffer = offersData?.offers?.[0]
        if (!firstOffer) {
            return res.status(500).json({
                error: "no_offers_returned",
                details: offersData,
            })
        }

        console.log("First offer:", firstOffer.offer_id, firstOffer.offer_details?.pricing)

        // ШАГ 2 — подтверждаем первый оффер
        const confirmRes = await fetch(`${YA_API}/api/b2b/platform/offers/confirm`, {
            method: "POST",
            headers,
            body: JSON.stringify({ offer_id: firstOffer.offer_id }),
        })

        const confirmData = await confirmRes.json()
        console.log("Confirm status:", confirmRes.status)
        console.log("Confirm data:", JSON.stringify(confirmData))

        if (!confirmRes.ok) {
            return res.status(confirmRes.status).json({
                error: "offer_confirm_failed",
                details: confirmData,
                offer_id: firstOffer.offer_id,
            })
        }

        // Успех — заказ создан
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
        console.error("Fetch error:", err)
        return res.status(500).json({ error: err.message })
    }
}
