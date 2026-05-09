import { AppIcon } from '../../common/AppIcon';
import { icons } from '../../common/iconMap';

const CURRENT_CONCLUSION =
  '本月教学指标整体下降，主要受平均分下降和出勤率降低影响。异常集中在八年级部分班级，建议重点关注出勤异常班级，并加强数学和英语薄弱学科辅导，优化课堂互动与作业反馈。';

export function CurrentConclusionCard() {
  return (
    <section className="right-card right-section">
      <h2 className="panel-section-title">
        <AppIcon icon={icons.alert} size={16} />
        <span>当前结论</span>
      </h2>

      <div className="conclusion-card">
        {CURRENT_CONCLUSION}
        <div className="conclusion-updated-at">更新时间：2026-05-17 10:10:00</div>
      </div>
    </section>
  );
}
