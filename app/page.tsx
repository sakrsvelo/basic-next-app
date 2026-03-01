import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
    // This is a Server Component, so we can access environment variables securely
    const dbHost = process.env.DB_HOST;

    return <LoginForm dbHost={dbHost} />;
}
