require 'nokogiri'
require 'open-uri'

class SourceSections

    KEY = '7dc4e624f3811b5d195a1712374912a4'
    
    def call
        url = URI.open("https://www.galacentre.ru/api/v2/sections/xml/?key=" + KEY)
        doc = Nokogiri::XML(url)
        
        res = []
        # res << ['Все категории', 'all']        
        
        doc.xpath("//category").each do |i| 
            res << [i.content, i['id']] if i['parentId'].blank?
        end

        res
    end

end