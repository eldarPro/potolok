require 'nokogiri'
require 'open-uri'

class GetSourceCatalog

    KEY = '7dc4e624f3811b5d195a1712374912a4'

    def initialize section_id
        @section_id = section_id
    end
    
    def call
        url = URI.open("https://www.galacentre.ru/api/v2/catalog/xml/?key=#{KEY}&section=#{@section_id}")
        doc = Nokogiri::XML(url)
        
        res = []
        
        doc.css("offer").each.with_index do |offer, inx| 
            item = {}

            item['articul']      = offer['articul']
            item['Наименование'] = offer.at_css('name').content
            item['Описание']     = offer.at_css('description').content
            item['Изображение']  = []
            item['Изображение'] << offer.at_css('picture').content

            offer.css("param").each do |off_param| 

                item['barcode'] = off_param.content if off_param['name'] == 'barcode' 

                if off_param['name'] == 'props'
                    off_param.css("variant").each do |var| 
                        var_item = var.content.split('=')
                        item[var_item[0]] = var_item[1]  
                    end
                end

                if off_param['name'] == 'specifications'
                    off_param.css("variant").each do |var| 
                        var_item = var.content.split('=')
                        item[var_item[0]] = var_item[1]  
                    end
                end

                if off_param['name'] == 'images'
                    off_param.css("variant").each{ |var| item['Изображение'] << var.content }
                end

            end

            res << item
        end

        res
    end

end