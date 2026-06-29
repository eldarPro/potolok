import { Locale } from '../lib/i18n';

const s: Record<string, string> = {
  // Tabs
  'tab.projects': 'Проекты',
  'tab.prices': 'Ценники',
  'tab.cabinet': 'Кабинет',

  // Common
  'common.cancel': 'Отмена',
  'common.save': 'Сохранить',
  'common.delete': 'Удалить',
  'common.add': 'Добавить',
  'common.new': 'Новый',
  'common.editing': 'Редактирование',
  'common.cannotUndo': 'Это действие нельзя отменить.',

  // Projects
  'proj.title': 'Проекты',
  'proj.search': 'Поиск',
  'proj.emptyTitle': 'Проектов пока нет',
  'proj.emptySubtitle': 'Создайте первый проект, чтобы начать замер и расчёт натяжных потолков',
  'proj.create': 'Создать проект',
  'proj.noResults': 'Ничего не найдено',
  'proj.noName': 'Без имени',
  'proj.noAddress': 'Адрес не указан',
  'proj.deleteConfirm': 'Удалить проект?',
  'proj.deleteMsg': 'Все помещения и данные будут удалены без возможности восстановления.',

  // Room plural keys (fallback for languages without few)
  'rooms.one': 'помещение',
  'rooms.few': 'помещения',
  'rooms.many': 'помещений',

  // New project
  'np.title': 'Новый проект',
  'np.client': 'Клиент *',
  'np.phone': 'Телефон',
  'np.address': 'Адрес объекта',
  'np.notes': 'Заметки',
  'np.clientPH': 'Иванов Иван',
  'np.phonePH': '+7 (999) 000-00-00',
  'np.addressPH': 'ул. Ленина 1, кв. 5',
  'np.notesPH': 'Дополнительная информация...',
  'np.errorClient': 'Укажите имя клиента',

  // Project detail
  'pd.rooms': 'Помещения',
  'pd.noRooms': 'Нет помещений — добавьте нажимая на кнопку +',
  'pd.newRoom': 'Новое помещение',
  'pd.roomPH': 'Название',
  'pd.roomExists': 'Помещение с таким названием уже существует',
  'pd.defaultRoomName': 'Помещение',
  'pd.undrawn': 'Чертёж не начерчен',
  'pd.total': 'Итого',
  'pd.approx': 'ориентировочно',
  'pd.summary': 'Смета',
  'pd.editTitle': 'Редактировать проект',
  'pd.project': 'Проект',
  'pd.pogM': 'пог. м',

  // Room suggestions
  'rs.0': 'Зал',
  'rs.1': 'Гостиная',
  'rs.2': 'Кухня',
  'rs.3': 'Спальня',
  'rs.4': 'Детская',
  'rs.5': 'Прихожая',
  'rs.6': 'Ванная',
  'rs.7': 'Кабинет',
  'rs.8': 'Балкон',

  // Room editor
  're.scale': 'Масштаб',
  're.area': 'Площадь',
  're.perimeter': 'Периметр',
  're.corners': 'Углов',
  're.done': 'Готово',
  're.templates': 'Готовые шаблоны',
  're.templatesSub': 'Выберите форму — она заполнит холст',
  're.renameHeader': 'Название помещения',
  're.renamePH': 'Введите название',
  're.rename': 'Редактировать название',
  're.clear': 'Очистить чертёж',
  're.deleteRoom': 'Удалить помещение',
  're.outOfBounds': 'Нельзя разместить за пределами помещения',
  're.roomLabel': 'Помещение',
  're.pts': 'точек',
  're.deleteHeader': 'Удалить помещение?',
  're.selectLight': 'Выберите элемент освещения',
  're.cm': 'см',

  // Templates
  'tpl.rect': 'Прямоугольник',
  'tpl.square': 'Квадрат',
  'tpl.lshape': 'Г-образная',
  'tpl.ushape': 'П-образная',
  'tpl.tshape': 'Т-образная',
  'tpl.trap': 'Трапеция',

  // Materials tabs
  'mat.fabric': 'Полотна',
  'mat.profile': 'Профили',
  'mat.lighting': 'Свет',
  'mat.accessories': 'Компл.',
  'mat.services': 'Доп. услуги',

  // Section names in RoomMaterials
  'sec.fabric': 'Полотна',
  'sec.profile': 'Профили',
  'sec.lighting': 'Освещение',
  'sec.accessories': 'Комплектующие',
  'sec.services': 'Доп. услуги',

  // Fabric
  'mf.noItems': 'Нет позиций — добавьте в Ценники → Полотна',

  // Profile (material)
  'mp.noDrawing': 'Сначала нарисуйте чертёж помещения',
  'mp.openDrawing': 'Открыть чертёж →',
  'mp.applyAll': 'Применить ко всем',
  'mp.applyAllHeader': 'Применить ко всем стенам профиль:',
  'mp.noProfile': 'Профиль не выбран',
  'mp.wall': 'Стена',
  'mp.noItems': 'Нет позиций — добавьте в Ценники → Профили',

  // Lighting (material)
  'ml.noCatalog': 'Нет освещения в ценнике',
  'ml.noCatalogSub': 'Добавьте позиции в Ценники → Освещение',
  'ml.noAdded': 'Нет добавленных позиций',
  'ml.noAddedSub': 'Нажмите кнопку + чтобы разместить элементы освещения на чертеже',
  'ml.line': 'Линия',
  'ml.point': 'Точка',

  // Accessories (material)
  'ma.noCatalog': 'Нет комплектующих в ценнике',
  'ma.noCatalogSub': 'Добавьте позиции в Ценники → Комплектующие',
  'ma.noAdded': 'Нет добавленных позиций',
  'ma.noAddedSub': 'Нажмите кнопку + чтобы добавить позиции к помещению',
  'ma.addPicker': 'Добавить комплектующее',

  // Services (material)
  'ms.noCatalog': 'Нет услуг в ценнике',
  'ms.noCatalogSub': 'Добавьте позиции в Ценники → Доп. услуги',
  'ms.noAdded': 'Нет добавленных позиций',
  'ms.noAddedSub': 'Нажмите кнопку + чтобы добавить услуги к помещению',
  'ms.addPicker': 'Добавить услугу',

  // Materials common
  'mc.openPrices': 'Открыть ценники',
  'mc.total': 'Итого',
  'mc.install': 'монтаж',
  'mc.changeProfile': 'Изменить профиль',
  'mc.changeSize': 'Изменить размер',
  'mc.split': 'Разделить',
  'mc.noProfile': 'Без профиля',
  'mc.sizeInput': 'Длина в метрах',
  'mc.splitInput': 'Расстояние в метрах',
  'mc.splitBtn': 'Разделить',
  'mc.applyBtn': 'Применить',
  'mc.unit': 'ед.',
  'mc.pcs': 'шт',
  'mc.m': 'м',

  // Summary
  'sum.title': 'Смета',
  'sum.materials': 'Материалы',
  'sum.lighting': 'Освещение',
  'sum.accessories': 'Аксессуары',
  'sum.services': 'Услуги',
  'sum.workerPay': 'Зарплата бригаде',
  'sum.totalToPay': 'Итого к оплате',
  'sum.perimLabel': 'м периметр',
  'sum.cornersLabel': 'углов',

  // PDF
  'pdf.title': 'Смета на натяжные потолки',
  'pdf.client': 'Клиент',
  'pdf.phone': 'Телефон',
  'pdf.address': 'Адрес',
  'pdf.date': 'Дата',
  'pdf.area': 'Площадь',
  'pdf.perimeter': 'Периметр',
  'pdf.corners': 'Углов',
  'pdf.totalRoom': 'Итого по помещению',
  'pdf.grandTotal': 'ИТОГО',

  // Profile (master)
  'prof.title': 'Личный профиль',
  'prof.fullName': 'ФИО',
  'prof.company': 'Компания',
  'prof.phone': 'Телефон',
  'prof.city': 'Город',
  'prof.email': 'Email',
  'prof.saved': 'Данные сохранены',
  'prof.namePH': 'Иванов Иван Иванович',
  'prof.companyPH': 'ООО «Потолки» или ИП',
  'prof.cityPH': 'Москва',
  'prof.emailPH': 'master@example.com',

  // Cabinet
  'cab.title': 'Кабинет',
  'cab.master': 'Мастер',
  'cab.fillData': 'Заполните данные — они будут отображаться в сметах',
  'cab.profile': 'Личный профиль',
  'cab.stats': 'Статистика',
  'cab.language': 'Язык',

  // Statistics
  'stat.title': 'Статистика',
  'stat.emptyTitle': 'Нет данных',
  'stat.emptySub': 'Создайте первый проект — здесь появится статистика',
  'stat.projects': 'проектов',
  'stat.rooms': 'помещений',
  'stat.volume': 'Объём работ',
  'stat.fabricArea': 'Площадь полотна',
  'stat.profilePerimeter': 'Периметр профиля',
  'stat.avgArea': 'Средняя площадь помещения',
  'stat.totalProfile': 'Профиль суммарно',
  'stat.finance': 'Финансы',
  'stat.totalBudget': 'Итого по сметам',
  'stat.workerPay': 'Зарплата бригаде',
  'stat.markup': 'Наценка',
  'stat.materials': 'Материалы',
  'stat.topFabric': 'Популярное полотно',
  'stat.usedTimes': 'использовано раз',
  'stat.light': 'Освещение',
  'stat.spots': 'Светильников (точки)',
  'stat.tracks': 'Лент и треков',
  'stat.activity': 'Активность за 6 месяцев',

  // Months
  'mon.0': 'Янв', 'mon.1': 'Фев', 'mon.2': 'Мар', 'mon.3': 'Апр',
  'mon.4': 'Май', 'mon.5': 'Июн', 'mon.6': 'Июл', 'mon.7': 'Авг',
  'mon.8': 'Сен', 'mon.9': 'Окт', 'mon.10': 'Ноя', 'mon.11': 'Дек',

  // Price list
  'pl.title': 'Ценники',
  'pl.positions': 'позиц.',
  'pl.noItems': 'Нет позиций',
  'pl.deleteConfirm': 'Удалить позицию?',
  'pl.default': 'по умолч.',
  'pl.clientSqm': 'клиент / м²',
  'pl.clientCorner': 'клиент / угол',
  'pl.installSqm': 'монтаж / м²',
  'pl.installCorner': 'монтаж / угол',
  'pl.clientPer': 'клиент / ',
  'pl.installPer': 'монтаж / ',
  'pl.client': 'клиенту',
  'pl.install': 'монтаж',
  'pl.pointType': 'Точечные',
  'pl.linearType': 'Линейные',
  'pl.addFabricsSub': 'Добавьте полотна, чтобы использовать их в расчётах',
  'pl.addProfilesSub': 'Добавьте профили, чтобы использовать их в расчётах',
  'pl.addLightingSub': 'Добавьте осветительные приборы, чтобы включать их в проекты',
  'pl.addAccessoriesSub': 'Добавьте комплектующие, чтобы включать их в расчёты',
  'pl.addServicesSub': 'Добавьте дополнительные услуги, чтобы включать их в расчёты',

  // Catalog/item form
  'cf.name': 'Название *',
  'cf.clientPrice': 'Цена клиенту (₽)',
  'cf.clientPriceCorner': 'Цена клиенту за угол (₽)',
  'cf.installPrice': 'Зарплата за установку (₽)',
  'cf.installPriceCorner': 'Зарплата за угол (₽)',
  'cf.isDefault': 'По умолчанию',
  'cf.color': 'Цвет',
  'cf.errorName': 'Укажите название',

  // Lighting form
  'lf.type': 'Тип',
  'lf.placement': 'Размещение',
  'lf.placementPoint': 'Точка на чертеже',
  'lf.placementPath': 'Линия на чертеже',
  'lf.unit': 'Единица измерения',
  'lf.clientPrice': 'Цена клиенту (₽ / {unit})',
  'lf.installPrice': 'Зарплата за установку (₽ / {unit})',
  'lf.color': 'Цвет на чертеже',
  'lf.symbol': 'Символ на чертеже',

  // Lighting types
  'lt.spot': 'Спот',
  'lt.chandelier': 'Люстра',
  'lt.track_spot': 'Трек-спот',
  'lt.strip': 'LED-лента',
  'lt.line': 'Световая линия',
  'lt.track': 'Трек',

  // Units
  'unit.pcs': 'шт',
  'unit.m': 'м',

  // Accessory form
  'af.unit': 'Единица измерения',
  'af.clientPrice': 'Цена клиенту (₽ / {unit})',
  'af.installPrice': 'Зарплата за установку (₽ / {unit})',

  // Service form
  'sf.clientPrice': 'Цена клиенту (₽)',
  'sf.installPrice': 'Зарплата за установку (₽)',
  'sf.description': 'Описание',
  'sf.descriptionPH': 'Необязательно',

  // Language
  'lang.title': 'Язык / Language',
  'lang.changeItem': 'Язык / Language',

  // Common extras
  'common.edit': 'Редактировать',
  'common.apply': 'Применить',

  // RoomEditor extras
  'mat.tabFabric': 'Полотна',
  'mat.tabProfile': 'Профили',
  'mat.tabLight': 'Свет',
  'mat.tabAccess': 'Компл.',
  'mat.tabServices': 'Доп. услуги',
  'tpl.title': 'Готовые шаблоны',
  'tpl.subtitle': 'Выберите форму — она заполнит холст',
  're.editName': 'Редактировать название',
  're.clearDraft': 'Очистить чертёж',
  're.renameTitle': 'Название помещения',
  're.namePH': 'Введите название',
  're.deleteRoomTitle': 'Удалить помещение?',
  're.deleteRoomMsg': 'Помещение «{name}» и все его данные будут удалены.',
  're.pickLighting': 'Выберите элемент освещения',
  're.points': 'точек',
  'pd.room': 'Помещение',

  // ProjectDetail extras
  'pd.estimate': 'Смета',
  'pd.roomName': 'Название',
  'pd.notDrawn': 'Чертёж не начерчен',
  'pd.linM': 'пог. м',
  'pd.deleteTitle': 'Удалить проект?',
  'pd.deleteMsg': 'Все помещения и данные будут удалены без возможности восстановления.',
  'pd.editProject': 'Редактировать проект',

  // Summary extras
  'sum.total': 'Итого',
  'sum.mPerimeter': 'м периметр',
  'sum.corners': 'углов',
  'sum.totalLabel': 'Итого к оплате',
  'pdf.roomTotal': 'Итого по помещению',
  'pdf.totalArea': 'общей площади',

  // RoomMaterials extras
  'mat.noFabrics': 'Нет позиций — добавьте в Ценники → Полотна',
  'mat.applyAll': 'Применить ко всем',
  'mat.drawFirst': 'Сначала нарисуйте чертёж помещения',
  'mat.openDraft': 'Открыть чертёж →',
  'mat.noProfiles': 'Нет позиций — добавьте в Ценники → Профили',
  'mat.wall': 'Стена',
  'mat.noProfile': 'Профиль не выбран',
  'mat.noLightCatalog': 'Нет освещения в ценнике',
  'mat.noLightCatalogSub': 'Добавьте позиции в Ценники → Освещение',
  'mat.openPrices': 'Открыть ценники',
  'mat.noItems': 'Нет добавленных позиций',
  'mat.addLightSub': 'Нажмите кнопку + чтобы разместить элементы освещения на чертеже',
  'mat.noAccessoryCatalog': 'Нет комплектующих в ценнике',
  'mat.noAccessoryCatalogSub': 'Добавьте позиции в Ценники → Комплектующие',
  'mat.addItemSub': 'Нажмите кнопку + чтобы добавить позиции к помещению',
  'mat.noServiceCatalog': 'Нет услуг в ценнике',
  'mat.noServiceCatalogSub': 'Добавьте позиции в Ценники → Доп. услуги',
  'mat.addServiceSub': 'Нажмите кнопку + чтобы добавить услуги к помещению',
  'mat.line': 'Линия',
  'mat.point': 'Точка',
  'mat.install': 'монтаж',
  'mat.applyAllHeader': 'Применить ко всем стенам профиль:',
  'mat.noProfileBtn': 'Без профиля',
  'mat.wallSize': 'Стена',
  'mat.lengthM': 'Длина в метрах',
  'mat.splitWall': 'Разделить стену',
  'mat.splitMsg': 'Длина: {len} м. Укажите расстояние от начала стены.',
  'mat.distM': 'Расстояние в метрах',
  'mat.split': 'Разделить',
  'mat.changeProfile': 'Изменить профиль',
  'mat.changeSize': 'Изменить размер',
  'mat.addAccessory': 'Добавить комплектующее',
  'mat.addService': 'Добавить услугу',

  // CatalogList extras
  'cf.subtitleFabric': 'Добавьте полотна, чтобы использовать их в расчётах',
  'cf.subtitleProfile': 'Добавьте профили, чтобы использовать их в расчётах',
  'cf.default': 'по умолч.',
  'mf.clientPerSqm': 'клиент / м²',
  'mf.clientPerCorner': 'клиент / угол',
  'mf.installPerSqm': 'монтаж / м²',
  'mf.installPerCorner': 'монтаж / угол',
  'pl.deleteTitle': 'Удалить позицию?',
  'pl.deleteMsg': 'Это действие нельзя отменить.',

  // CatalogForm extras
  'cf.newTitle': 'Новый',
  'cf.editTitle': 'Редактирование',
  'cf.errorTitle': 'Укажите название',
  'mf.clientPrice': 'Цена клиенту (₽)',
  'mf.clientPriceCorner': 'Цена клиенту за угол (₽)',
  'mf.installPrice': 'Зарплата за установку (₽)',
  'mf.installPriceCorner': 'Зарплата за угол (₽)',

  // LightingList extras
  'lf.subtitle': 'Добавьте осветительные приборы, чтобы включать их в проекты',
  'lf.point': 'Точечные',
  'lf.path': 'Линейные',
  'ml.clientPer': 'клиент / ',
  'ml.installPer': 'монтаж / ',

  // LightingForm extras
  'lf.chartColor': 'Цвет на чертеже',
  'lf.chartSymbol': 'Символ на чертеже',

  // AccessoryList extras
  'af.subtitle': 'Добавьте комплектующие, чтобы включать их в расчёты',
  'ma.clientPer': 'клиент / ',
  'ma.installPer': 'монтаж / ',

  // ServiceList extras
  'sf.subtitle': 'Добавьте дополнительные услуги, чтобы включать их в расчёты',
  'ms.client': 'клиенту',
  'ms.install': 'монтаж',

  // ServiceForm extras
  'sf.optional': 'Необязательно',

  // Lighting type alias
  'lt.trackSpot': 'Трек-спот',

  // Cabinet
  'cab.handbook': 'Справочник',

  // Handbook
  'hb.title': 'Справочник',
  'hb.s0.title': 'Проекты',
  'hb.s0.text': 'Каждый проект — это один объект (квартира, дом, офис). Создайте проект, добавьте помещения и укажите параметры каждой комнаты. Готовый проект можно открыть в любое время и продолжить работу.',
  'hb.s1.title': 'Добавление помещения',
  'hb.s1.text': 'Внутри проекта нажмите «Добавить помещение». Укажите название и форму комнаты. В редакторе можно задать размеры, выбрать полотно, профиль, освещение и дополнительные услуги.',
  'hb.s2.title': 'Смета',
  'hb.s2.text': 'После заполнения всех помещений откройте «Смету» в проекте. Приложение автоматически посчитает площадь, периметр и итоговую стоимость по вашему прайс-листу.',
  'hb.s3.title': 'Прайс-лист',
  'hb.s3.text': 'Раздел «Ценники» содержит ваш личный прайс-лист: полотна, профили, освещение, услуги и аксессуары. Добавьте позиции один раз — они будут доступны при оформлении любого проекта.',
  'hb.s4.title': 'Статистика',
  'hb.s4.text': 'Раздел «Статистика» в кабинете показывает общее количество проектов, суммарную площадь и объём выполненных работ за всё время.',
  'hb.s5.title': 'Личный профиль',
  'hb.s5.text': 'Укажите имя, компанию и контактный телефон. Эти данные отображаются в сметах, которые видит клиент.',
};

export const ru: Locale = {
  strings: s,
  roomsPlural: (n: number): string => {
    if (n % 10 === 1 && n % 100 !== 11) return s['rooms.one'];
    if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return s['rooms.few'];
    return s['rooms.many'];
  },
};
