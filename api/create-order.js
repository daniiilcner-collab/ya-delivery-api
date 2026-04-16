export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    const { destinationId, customerName, customerPhone, quantity } = req.body

    const token = process.env.YA_DELIVERY_TOKEN

    // 🔍 Диагностика — первые и последние 6 символов токена
    console.log("TOKEN first 6:", token ? token.substring(0, 6) : "EMPTY")
    console.log("TOKEN last 6:", token ? token.substring(token.length - 6) : "EMPTY")
    console.log("TOKEN length:", token ? token.length : 0)
    console.log("CLIENT_ID:", process.env.YA_CLIENT_ID)
    console.log("destinationId:", destinationId)

    const body = {
        info: {
            operator_request_id: `order-${Date.now()}`,
        },
        source: {
            platform_station: {
                platform_station_id: "05e809bb-4521-42d9-a936-0fb0744c0fb3",
            },
        },
        destination: {
            platform_station: {
                platform_station_id: destinationId,
            },
        },
        cargo_parcels: [
            {
                physical_dims: {
                    weight_gross: 10000,
                },
            },
        ],
        recipients: [
            {
                name: customerName,
                phone: customerPhone,
                email: "",
            },
        ],
        last_mile_policy: "time_interval",
        billing_info: {
            payment_method: "already_paid",
            delivery_cost: 0,
        },
    }

    try {
        const response = await fetch(
            "https://b2b-authproxy.taxi.yandex.net/api/b2b/platform/offers/create",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "X-Client-ID": process.env.YA_CLIENT_ID,
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
