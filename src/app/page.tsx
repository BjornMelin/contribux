export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-center font-bold text-4xl">Welcome to Contribux</h1>
      </div>

      <div className="relative flex place-items-center">
        <div className="grid place-content-center rounded-xl border bg-gray-200 p-6 dark:bg-gray-800">
          <p className="text-center">Next.js 15 • TypeScript • Tailwind CSS • App Router</p>
          <p className="mt-2 text-center text-gray-600 text-sm dark:text-gray-400">
            Modern web application with PWA support
          </p>
        </div>
      </div>
    </main>
  )
}
