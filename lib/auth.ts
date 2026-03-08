import { betterAuth, BetterAuthOptions } from "better-auth";
import { bearer } from "better-auth/plugins";
import { pool } from "./db";

export const authOptions = {
    database: pool,

    user: { 
        modelName: "users",
        additionalFields: {
            active: {
                type: "boolean",
            },
        },
    },
    session: { 
        modelName: "sessions",
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },

    emailAndPassword: {
        enabled: true,
    },

    plugins: [
        bearer(),
    ],

    secret: process.env.BETTER_AUTH_SECRET,

    // ✅ Production / serverless settings
    baseURL: process.env.BETTER_AUTH_URL, // Add this in Vercel env
    trustedOrigins: [
        "http://localhost:3000",
        "https://basic-next-app-nu.vercel.app",
    ],
    // advanced: {
    //     trustHost: true, // Important for Vercel proxy headers
    // },
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);

export type Auth = typeof auth;
export type AuthOptions = typeof authOptions;