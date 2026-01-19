import { LoginForm } from "@/components/login-form"
import { Anchor } from "lucide-react"

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary mb-4">
            <Anchor className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-balance mb-2">Nautic</h1>
          <p className="text-muted-foreground leading-relaxed">Sistema profesional de inspección marítima</p>
        </div>

        <LoginForm />

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Sistema seguro de inspección naval</p>
        </div>
      </div>
    </div>
  )
}
