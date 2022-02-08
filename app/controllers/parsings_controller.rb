class ParsingsController < ApplicationController
 
    def index 
        @templates = [['Текстиль', ['КПБ','Одеяла','Подушки','Полотенца','Покрывала','Пледы','Скатерти', 'Фартуки, рукавицы', 'Пододеяльники, простыни, наволочки']]] 
    end

    def launch
        @temp = params[:temp].downcase

        list_barcodes = params[:list_barcodes][0].split(' ')

        @res = GetSourceCatalog.new(130).call # Загрузка каталога (Текстиль)
        @res.select!{ |i| list_barcodes.include?(i['barcode']) } # Выборка из списка соответствующим по штрих-кодам

        puts list_barcodes
        puts @res.length
    end

end
