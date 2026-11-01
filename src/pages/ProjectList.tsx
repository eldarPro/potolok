import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonFab, IonFabButton, IonIcon, IonItem,
  IonItemSliding, IonItemOptions, IonItemOption,
  IonSearchbar, IonButtons, IonButton,
  IonInfiniteScroll, IonInfiniteScrollContent,
  useIonViewWillEnter,
} from '@ionic/react';
import { add, trashOutline, folderOpenOutline, searchOutline, closeOutline, optionsOutline, personOutline, callOutline, locationOutline } from 'ionicons/icons';
import { loadProjects, deleteProject } from '../lib/storage';
import { useConfirm } from '../components/Dialogs';
import { projectEstimate } from '../lib/pricing';
import { Project } from '../types';
import ActionButton from '../components/ActionButton';
import ProjectFilterSheet from '../components/ProjectFilterSheet';
import { DEFAULT_FILTERS, ProjectFilters, activeFilterCount, filterProjects, projectDate } from '../lib/projectFilter';
import { useT } from '../lib/i18n';
import './ProjectList.css';

const projectArea = (p: Project) => p.rooms.reduce((s, r) => s + r.areaSqm, 0);
const projectPrice = (p: Project) => projectEstimate(p).clientTotal;

/** Cards rendered per infinite-scroll step */
const PAGE_SIZE = 10;

const formatRub = (v: number) => `${Math.round(v).toLocaleString('ru')} ₽`;

/** Soft background / strong text pairs; picked by name so a client keeps one color */
const AVATAR_COLORS: [string, string][] = [
  ['#E3F2FD', '#1565C0'],
  ['#E0F2EF', '#11635F'],
  ['#FEF3C7', '#B45309'],
  ['#FCE7F3', '#BE185D'],
  ['#EDE9FE', '#6D28D9'],
  ['#DCFCE7', '#15803D'],
  ['#FFEDD5', '#C2410C'],
  ['#E0E7FF', '#4338CA'],
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(w => w.match(/\p{L}|\p{N}/u)?.[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const ClientAvatar: React.FC<{ name: string }> = ({ name }) => {
  const letters = initials(name);
  if (!letters) {
    return (
      <div className="client-avatar client-avatar--empty">
        <IonIcon icon={personOutline} />
      </div>
    );
  }
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  const [bg, fg] = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <div className="client-avatar" style={{ background: bg, color: fg }}>
      {letters}
    </div>
  );
};

const ProjectList: React.FC = () => {
  const { t, lang } = useT();
  const [projects, setProjects] = useState<Project[]>([]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchbarRef = useRef<HTMLIonSearchbarElement>(null);
  const [filters, setFilters] = useState<ProjectFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchbarRef.current?.setFocus(), 50);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const refresh = () => setProjects(loadProjects());
  useIonViewWillEnter(() => { refresh(); });

  const confirm = useConfirm();
  const handleDelete = async (id: string, name: string, slider: HTMLIonItemSlidingElement | null) => {
    const ok = await confirm({
      title: t('pd.deleteTitle'),
      message: <><b>«{name}»</b><br />{t('proj.deleteMsg')}</>,
      confirmText: t('common.delete'),
    });
    slider?.close();
    if (!ok) return;
    deleteProject(id);
    refresh();
  };

  const relDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(new Date()) - day(d)) / 86400000);
    if (diff === 0) return t('proj.today');
    if (diff === 1) return t('proj.yesterday');
    return d.toLocaleDateString(lang, { day: 'numeric', month: 'short' });
  };

  // the estimate is the heaviest part of a card, so it's computed once per load
  const prices = useMemo(() => new Map(projects.map(p => [p.id, projectPrice(p)])), [projects]);
  const priceOf = (p: Project) => prices.get(p.id) ?? 0;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const searched = q
      ? projects.filter(p =>
          p.clientName.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q) ||
          p.phone.toLowerCase().includes(q)
        )
      : projects;
    return filterProjects(searched, filters, p => prices.get(p.id) ?? 0);
  }, [projects, prices, q, filters]);

  const filterCount = activeFilterCount(filters);
  const page = filtered.slice(0, shown);

  // a new search or filter starts again from the first page
  useEffect(() => { setShown(PAGE_SIZE); }, [q, filters]);

  const loadMore = (e: CustomEvent<void>) => {
    setShown(n => n + PAGE_SIZE);
    (e.target as HTMLIonInfiniteScrollElement).complete();
  };

  return (
    <IonPage>
      <IonHeader className="blue-header">
        <IonToolbar>
          {searchOpen ? (
            <>
              <IonSearchbar
                ref={searchbarRef}
                value={query}
                onIonInput={e => setQuery(e.detail.value ?? '')}
                placeholder={t('proj.search')}
                debounce={100}
                className="project-searchbar-inline"
              />
              <IonButtons slot="end">
                <IonButton onClick={closeSearch}>
                  <IonIcon slot="icon-only" icon={closeOutline} />
                </IonButton>
              </IonButtons>
            </>
          ) : (
            <>
              <IonTitle>{t('proj.title')}</IonTitle>
              {projects.length > 0 && (
                <IonButtons slot="end">
                  <IonButton onClick={() => setFiltersOpen(true)} className="project-filter-btn">
                    <IonIcon slot="icon-only" icon={optionsOutline} />
                    {filterCount > 0 && <span className="project-filter-btn__badge">{filterCount}</span>}
                  </IonButton>
                  <IonButton onClick={openSearch}>
                    <IonIcon slot="icon-only" icon={searchOutline} />
                  </IonButton>
                </IonButtons>
              )}
            </>
          )}
        </IonToolbar>
      </IonHeader>

      <IonContent className="project-list-content">
        {projects.length === 0 ? (
          <div className="project-list-empty">
            <div className="empty-state">
              <div className="empty-state__icon-wrap">
                <IonIcon icon={folderOpenOutline} />
              </div>
              <p className="empty-state__title">{t('proj.emptyTitle')}</p>
              <p className="empty-state__subtitle">
                {t('proj.emptySubtitle')}
              </p>
              <ActionButton solid routerLink="/new-project">
                {t('proj.create')}
              </ActionButton>
            </div>
          </div>
        ) : (
          <>
            <div className="blue-hero" />

            <div className="card-list project-list-cards blue-hero-overlap">
              {filtered.length === 0 ? (
                <div className="project-list-no-results card">
                  <IonIcon icon={filterCount > 0 ? optionsOutline : searchOutline} />
                  <p>{t('proj.noResults')}</p>
                  {filterCount > 0 && (
                    <button className="project-list-reset" onClick={() => setFilters(DEFAULT_FILTERS)}>
                      {t('pf.reset')}
                    </button>
                  )}
                </div>
              ) : page.map(p => {
                const sqm = projectArea(p);
                const price = priceOf(p);
                return (
                  <IonItemSliding key={p.id}>
                    <IonItem
                      button
                      detail={false}
                      routerLink={`/project/${p.id}`}
                      lines="none"
                      className="project-list-item"
                    >
                      <div className="project-card card">
                        <ClientAvatar name={p.clientName} />

                        <div className="project-card__body">
                          <div className="project-card__top">
                            <div className="project-card__name">{p.clientName || t('proj.noName')}</div>
                            <div className="project-card__date">{relDate(projectDate(p))}</div>
                          </div>
                          {p.phone && (
                            <div className="project-card__line">
                              <IonIcon icon={callOutline} />
                              <span>{p.phone}</span>
                            </div>
                          )}
                          <div className={`project-card__line${p.address ? '' : ' project-card__line--empty'}`}>
                            <IonIcon icon={locationOutline} />
                            <span>{p.address || t('proj.noAddress')}</span>
                          </div>

                          {p.rooms.length > 0 ? (
                            <div className="project-card__bottom">
                              <div className="project-card__tags">
                                <span className="chip">{t('proj.roomsShort', { n: p.rooms.length })}</span>
                                {sqm > 0 && <span className="chip">{sqm.toFixed(1)} м²</span>}
                              </div>
                              {price > 0 && <div className="project-card__sum">{formatRub(price)}</div>}
                            </div>
                          ) : (
                            <div className="project-card__tags">
                              <span className="chip project-card__chip-new">{t('proj.newEmpty')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </IonItem>

                    <IonItemOptions side="end">
                      <IonItemOption color="danger" onClick={e => handleDelete(p.id, p.clientName, (e.currentTarget as HTMLElement).closest('ion-item-sliding'))}>
                        <IonIcon slot="icon-only" icon={trashOutline} />
                      </IonItemOption>
                    </IonItemOptions>
                  </IonItemSliding>
                );
              })}
            </div>

            <IonInfiniteScroll onIonInfinite={loadMore} disabled={shown >= filtered.length}>
              <IonInfiniteScrollContent />
            </IonInfiniteScroll>
          </>
        )}

        <ProjectFilterSheet
          isOpen={filtersOpen}
          filters={filters}
          found={filtered.length}
          onChange={setFilters}
          onClose={() => setFiltersOpen(false)}
        />

        <IonFab vertical="bottom" horizontal="end" slot="fixed">
          <IonFabButton routerLink="/new-project">
            <IonIcon icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  );
};

export default ProjectList;
