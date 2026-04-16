export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    const { destinationId, customerName, customerPhone, quantity } = req.body

    const token = process.env.YA_DELIVERY_TOKEN
    const clientId = process.env.YA_CLIENT_ID

    console.log("TOKEN first 6:", token ? token.substring(0, 6) : "EMPTY")
    console.log("destinationId:", destinationId)
    console.log("customerName:", customerName)
    console.log("quantity:", quantity)

    const body = {
        info: {
            operator_request_id: `order-${Date.now()}`,
        },
        source: {
            platform_station: {
                platform_id: "05e809bb-4521-42d9-a936-0fb0744c0fb3", // наш склад
            },
        },
        destination: {
            type: "platform_station", // доставка до ПВЗ
            platform_station: {
                platform_id: destinationId, // ПВЗ выбранный покупателем
            },
        },
        items: [
            {
                count: Number(quantity),
                name: "стикеры яковлева",
                article: "STICKER-001",
                billing_details: {
                    inn: process.env.SELLER_INN || "000000000000",
                    nds: -1,           // без НДС
                    unit_price: Number(process.env.UNIT_PRICE || 1301) * 100,           // в копейках
                    assessed_unit_price: Number(process.env.UNIT_PRICE || 1301) * 100,  // в копейках
                },
                physical_dims: {
                    predefined_volume: 500, // объём в см3
                },
            },
        ],
        places: [
            {
                physical_dims: {
                    weight_gross: 10000, // вес в граммах
                    dx: 10,
                    dy: 10,
                    dz: 10,
                },
            },
        ],
        billing_info: {
            payment_method: "already_paid", // предоплата
            delivery_cost: 0,
        },
        recipient_info: {
            first_name: customerName,
            phone: customerPhone,
            email: "",
        },
        last_mile_policy: "self_pickup", // доставка до ПВЗ (не до двери!)
    }

    console.log("Sending to YA:", JSON.stringify(body))

    try {
        const response = await fetch(
            "https://b2b-authproxy.taxi.yandex.net/api/b2b/platform/offers/create",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`,
                    "X-Client-ID": clientId,
                },
                body: JSON.stringify(body),
            }
        )

        const data = await response.json()
        console.log("YA response status:", response.status)
        console.log("YA response:", JSON.stringify(data))

        if (!response.ok) {
            return res.status(response.status).json({ error: data })
        }

        return res.status(200).json({ success: true, data })

    } catch (err) {
        console.error("Fetch error:", err)
        return res.status(500).json({ error: err.message })
    }
}
