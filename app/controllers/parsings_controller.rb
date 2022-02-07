class ParsingsController < ApplicationController
    include ActionView::Helpers::FormOptionsHelper

    def index 
        @templates = [['Текстиль', 'textile']]
    end

    def get_category
        categories = SourceCatalog.new.call
        render plain: options_for_select(categories.map { |i| [i[0], i[1]] })
    end

    def parsing_start
        #MyJob.perform_async
        #render plain: 'start'


        #################### STAGE 1

        list = ['4620061480427', '4650168491040', '4650168491057', '4650168491125', '4650168491118']
    
        url = URI.open("https://www.galacentre.ru/api/v2/catalog/xml/?section=130&key=7dc4e624f3811b5d195a1712374912a4")
        doc = Nokogiri::XML(url)
        
        res = []
        
        doc.css("offer").each.with_index do |offer, inx| 

            item = {}

            item['title']       = offer.at_css('name').content
            item['description'] = offer.at_css('description').content
            item['picture']     = offer.at_css('picture').content

            offer.css("param").each do |off_param| 

                item['barcode'] = off_param.content if off_param['name'] == 'barcode' 

                if off_param['name'] == 'props'
                    off_param.css("variant").each do |var| 
                        var_item = var.content.split('=')
                        item['type']  = var_item.last  if var_item.first == 'Тип товара'
                        item['brand'] = var_item.last  if var_item.first == 'Бренд'
                    end
                end

                if off_param['name'] == 'specifications'
                    off_param.css("variant").each do |var| 
                        var_item = var.content.split('=')
                        item['country']   = var_item[1]  if var_item[0] == 'Страна производитель'
                        item['material']  = var_item[1]  if var_item[0] == 'Материал'
                        item['color']     = var_item[1]  if var_item[0] == 'Цвет'
                        item['prostyn']   = var_item[1]  if var_item[0] == 'Простыня'
                        item['navoloch']  = var_item[1]  if var_item[0] == 'Наволочка'
                        item['pododeyal'] = var_item[1]  if var_item[0] == 'Пододеяльник'
                    end
                end

            end

            res << item
        end

        res.reject!{ |i| list.exclude?(i['barcode']) }

        #################### STAGE 2

        book = Spreadsheet::Workbook.new
        
        sheet1 = book.create_worksheet name: 'test'
        # sheet1.column(1).width = 25
        # sheet1.column(2).width = 25
        # sheet1.column(3).width = 25
        # sheet1.column(4).width = 35

        bg_green = Spreadsheet::Format.new pattern_bg_color: 'green',
                                            pattern_fg_color: 'green',
                                            pattern: 1
        rownum = 0

        ['наименование', 'код', 'Артикул', 'Штрихкод', 'Кратность', 'Бренд', 'Материал', 'Наволочка', 'Общий размер','Пододеяльник', 
         'Покрывало', 'Простыня', 'Состав', 'Страна', 'Тип застежки', 'Тип товара', 'Уход', 'Цвет', 'ссылка на фото/видео о товаре'].each_with_index do |name, inx|
            sheet1.row(rownum).push(name)
            sheet1.row(rownum).set_format(inx, bg_green)
          end

    
        rownum += 1

        sheet1.row(rownum).push('').set_format(0, bg_green)
        sheet1.row(rownum).push('').set_format(1, bg_green)
        sheet1.row(rownum).push('').set_format(2, bg_green)
        sheet1.row(rownum).push('').set_format(3, bg_green)
        sheet1.row(rownum).push('').set_format(4, bg_green)
        sheet1.row(rownum).push('00000000907').set_format(5, bg_green)
        sheet1.row(rownum).push('00000000437').set_format(6, bg_green)
        sheet1.row(rownum).push('00000091219').set_format(7, bg_green)
        sheet1.row(rownum).push('00000091777').set_format(8, bg_green)
        sheet1.row(rownum).push('00000091217').set_format(9, bg_green)
        sheet1.row(rownum).push('00000091611').set_format(10, bg_green)
        sheet1.row(rownum).push('00000091218').set_format(11, bg_green)
        sheet1.row(rownum).push('В0000000254').set_format(12, bg_green)
        sheet1.row(rownum).push('00000000322').set_format(13, bg_green)
        sheet1.row(rownum).push('00000091598').set_format(14, bg_green)
        sheet1.row(rownum).push('00000091393').set_format(15, bg_green)
        sheet1.row(rownum).push('00000091722').set_format(16, bg_green)
        sheet1.row(rownum).push('00000091592').set_format(17, bg_green)
        sheet1.row(rownum).push('').set_format(18, bg_green)
        
        rownum += 1

        res.each do |i|
            sheet1.row(rownum).push i['title']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['barcode']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['brand']
            sheet1.row(rownum).push i['material']
            sheet1.row(rownum).push i['navoloch']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['pododeyal']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['prostyn']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['country']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['type']
            sheet1.row(rownum).push ''
            sheet1.row(rownum).push i['color']
            sheet1.row(rownum).push i['picture']

            rownum += 1
        end

        file = File.expand_path File.join(Rails.root, 'tmp', "text.xls")
        book.write file

        File.open(file, 'r') do |f|
            send_data f.read, type: "application/excel", filename: "text.xls"
        end

        # render xml: res
    end

end
