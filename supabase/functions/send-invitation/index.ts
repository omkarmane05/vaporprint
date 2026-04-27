import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, shopName, activationUrl } = await req.json();

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "VaporPrint <onboarding@resend.dev>",
        to: [email],
        subject: `Invitation to join VaporPrint: ${shopName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h1 style="color: #8B5CF6; margin-bottom: 20px;">Welcome to VaporPrint</h1>
            <p>Hello!</p>
            <p>You have been invited to manage the VaporPrint station: <strong>${shopName}</strong>.</p>
            <p>Click the button below to initialize your station and set your secure password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${activationUrl}" style="background-color: #8B5CF6; color: white; padding: 15px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">ACTIVATE STATION</a>
            </div>
            <p style="font-size: 12px; color: #666;">If the button above doesn't work, copy and paste this link into your browser:</p>
            <p style="font-size: 12px; color: #666;">${activationUrl}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
            <p style="font-size: 10px; color: #999; text-align: center;">VaporPrint • Privacy-First Cloud Printing</p>
          </div>
        `,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
