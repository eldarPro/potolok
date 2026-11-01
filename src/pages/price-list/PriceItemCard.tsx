import React from 'react';
import { IonIcon } from '@ionic/react';
import { ellipsisVertical, createOutline, trashOutline } from 'ionicons/icons';
import { useMenu } from '../../components/Dialogs';
import { useT } from '../../lib/i18n';

export interface PriceLine {
  value: number;
  unit?: string;
}

interface Props {
  title: string;
  swatch?: React.ReactNode;
  tags?: React.ReactNode;
  client: PriceLine[];
  worker: PriceLine[];
  description?: string;
  onEdit: () => void;
  onDelete: () => void;
}

const PriceColumn: React.FC<{ kind: 'client' | 'worker'; label: string; lines: PriceLine[] }> = ({ kind, label, lines }) => (
  <div className={`price-item-card__col price-item-card__col--${kind}`}>
    <span className="price-item-card__col-label">{label}</span>
    {lines.map((l, i) => (
      <div className="price-item-card__line-row" key={i}>
        <span className="price-item-card__price-val">{l.value} ₽</span>
        {l.unit && <span className="price-item-card__price-unit">{l.unit}</span>}
      </div>
    ))}
  </div>
);

const PriceItemCard: React.FC<Props> = ({ title, swatch, tags, client, worker, description, onEdit, onDelete }) => {
  const { t } = useT();
  const menu = useMenu();

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    menu({
      title,
      items: [
        { icon: createOutline, label: t('common.edit'), onClick: onEdit },
        { icon: trashOutline, label: t('common.delete'), danger: true, onClick: onDelete },
      ],
    });
  };

  return (
    <div className="price-item-card" onClick={onEdit}>
      <div className="price-item-card__header">
        {swatch}
        <span className="price-item-card__title">{title}</span>
        {tags}
        <button className="price-item-card__menu-btn" onClick={openMenu}>
          <IonIcon icon={ellipsisVertical} />
        </button>
      </div>
      <div className="price-item-card__cols">
        <PriceColumn kind="client" label={t('pe.client')} lines={client} />
        <PriceColumn kind="worker" label={t('pe.worker')} lines={worker} />
      </div>
      {description ? <p className="price-item-card__desc">{description}</p> : null}
    </div>
  );
};

export default PriceItemCard;
