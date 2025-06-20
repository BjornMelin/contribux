export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold text-center">Welcome to Contribux</h1>
      </div>

      <div className="relative flex place-items-center">
        <div className="grid place-content-center rounded-xl border bg-gray-200 p-6 dark:bg-gray-800">
          <p className="text-center">Next.js 15 • TypeScript • Tailwind CSS • App Router</p>
          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2">
            Modern web application with PWA support
          </p>
        </div>
      </div>
    </main>
  )
}
