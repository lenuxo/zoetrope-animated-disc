import { Button } from '@/components/ui/button'
import { Link } from 'react-router'
import { PageHeading } from '../components/PageHeading'

export function NotFoundPage() {
  return (
    <>
      <PageHeading title="404 · 页面不存在" description="这个地址还没有对应的页面，可以返回工作台继续。" />
      <Button asChild className="mt-8"><Link to="/">返回工作台</Link></Button>
    </>
  )
}
