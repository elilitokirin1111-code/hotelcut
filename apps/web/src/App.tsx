const services = [
  { name: 'Web', detail: 'React + Vite', status: 'ready' },
  { name: 'API', detail: 'Fastify + TypeScript', status: 'ready' },
  { name: 'Render Worker', detail: 'BullMQ boundary', status: 'ready' },
  { name: 'Analysis Worker', detail: 'Python 3.12', status: 'ready' },
] as const;

export function App() {
  return (
    <main className="min-h-screen bg-paper px-6 py-12 text-ink">
      <section className="mx-auto max-w-5xl">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-coral">
          M0 foundation
        </p>
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
          <div>
            <h1 className="text-6xl font-black tracking-tight sm:text-7xl">HotelCut</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              面向酒店客户的短视频自动剪辑生成系统。当前版本建立了可持续开发、测试和部署的工程基础。
            </p>
          </div>
          <div className="rounded-3xl bg-ink p-6 text-white shadow-xl">
            <p className="text-sm text-white/60">Current milestone</p>
            <p className="mt-2 text-3xl font-bold">M0</p>
            <p className="mt-3 text-sm leading-6 text-white/70">
              Monorepo · Infrastructure · CI · Health checks
            </p>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service) => (
            <article
              className="rounded-2xl border border-black/10 bg-white/70 p-5 shadow-sm"
              key={service.name}
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-bold">{service.name}</h2>
                <span className="h-2.5 w-2.5 rounded-full bg-teal" aria-label={service.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{service.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
