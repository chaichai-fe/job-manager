import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, FolderKanban, KeyRound, LinkIcon } from 'lucide-react'
import { listProjects } from '../../server/projects'
import { listLinks } from '../../server/links'
import { listAccounts } from '../../server/accounts'

export const Route = createFileRoute('/_authed/')({
  component: DashboardPage,
})

function DashboardPage() {
  const { user } = Route.useRouteContext()
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(),
  })
  const links = useQuery({ queryKey: ['links'], queryFn: () => listLinks() })
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => listAccounts(),
  })

  const linkProjectCount = new Set(
    (links.data ?? []).map((l) => l.groupName || '未分组'),
  ).size

  const cards = [
    {
      to: '/projects' as const,
      title: '项目',
      desc: '需求 / 项目 / 分支 / 状态 / 备注',
      icon: FolderKanban,
      count: projects.data?.length ?? 0,
    },
    {
      to: '/links' as const,
      title: 'Gitlab & Jenkins',
      desc: '按仓库分组的代码库与流水线链接',
      icon: LinkIcon,
      count: linkProjectCount,
    },
    {
      to: '/accounts' as const,
      title: '账号体系',
      desc: '测试账号、密码与详细信息',
      icon: KeyRound,
      count: accounts.data?.length ?? 0,
    },
  ]

  return (
    <div className="rise-in space-y-8">
      <div>
        <p className="island-kicker">Dashboard</p>
        <h1 className="display-title mt-1 text-3xl font-bold text-foreground">
          你好，{user.name || user.email.split('@')[0]}
        </h1>
        <p className="mt-2 text-muted-foreground">
          这里是你的工作常用内容集合。
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="feature-card group rounded-2xl border border-border p-6 transition"
          >
            <div className="flex items-start justify-between">
              <card.icon className="size-6 text-[var(--lagoon-deep)]" />
              <span className="text-3xl font-bold text-foreground tabular-nums">
                {card.count}
              </span>
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              {card.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{card.desc}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--lagoon-deep)]">
              进入管理
              <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
