class ParsingsController < ApplicationController
 
    def index 
        # https://grabify.link/track/HJTF70
        # redirect_to 'https://grabify.link/EFVI9B' and return
    end

    def launch
        @temp = params[:temp].downcase

        list_barcodes = params[:list_barcodes][0].split(' ')

        @res = GetSourceCatalog.new(130).call # Загрузка каталога (Текстиль)
        @res.select!{ |i| list_barcodes.include?(i['barcode']) } # Выборка из списка соответствующим по штрих-кодам

        render xlsx: 'launch', filename: "nomenkl_#{DateTime.current}.xlsx"
    end

end
